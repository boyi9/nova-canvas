"""人机接缝总线：线下动作与人工审查的统一编排。"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from typing import Callable, Optional, Any, Dict

from .handoff_models import (
    HandoffTask, HandoffType, HandoffState, SLA_HOURS, RED_LINE_TYPES,
    LEGAL_TRANSITIONS, validate_transition,
)


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def create_task(
    task_id: str,
    htype: HandoffType,
    project_id: str,
    title: str,
    payload: Optional[Dict[str, Any]] = None,
    assignee: str = "",
) -> HandoffTask:
    task = HandoffTask(
        task_id=task_id,
        htype=htype,
        project_id=project_id,
        title=title,
        payload=payload or {},
        assignee=assignee,
    )
    task._log("created", htype.value)
    return task


def dispatch(task: HandoffTask, assignee: str = "") -> HandoffTask:
    if assignee:
        task.assignee = assignee
    if not validate_transition(task.state, HandoffState.DISPATCHED):
        raise ValueError(f"illegal transition {task.state.value} -> dispatched")
    task.state = HandoffState.DISPATCHED
    task._log("dispatched", assignee or "auto")
    return task


def accept(task: HandoffTask, actor: str) -> HandoffTask:
    if not validate_transition(task.state, HandoffState.IN_PROGRESS):
        raise ValueError(f"illegal transition {task.state.value} -> in_progress")
    task.state = HandoffState.IN_PROGRESS
    task._log("accepted", "", actor)
    return task


def submit(task: HandoffTask, payload: Dict[str, Any], actor: str) -> HandoffTask:
    """执行人回传。幂等：同一内容重复提交只生效一次。"""
    key = task.task_id + ":" + hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    if key in task.idempotency_keys:
        task._log("duplicate_submit_ignored", key[:16], actor)
        return task
    task.idempotency_keys.add(key)
    task.payload.update(payload)
    if not validate_transition(task.state, HandoffState.RETURNED):
        raise ValueError(f"illegal transition {task.state.value} -> returned")
    task.state = HandoffState.RETURNED
    task._log("submitted", "", actor)
    return task


def validate(task: HandoffTask, validator: Callable[[HandoffTask], tuple], actor: str = "system") -> HandoffTask:
    """validator 返回 (ok: bool, reason: str)。"""
    ok, reason = validator(task)
    if ok:
        if not validate_transition(task.state, HandoffState.VALIDATED):
            raise ValueError(f"illegal transition {task.state.value} -> validated")
        task.state = HandoffState.VALIDATED
        task._log("validated", reason, actor)
    else:
        if not validate_transition(task.state, HandoffState.REJECTED):
            raise ValueError(f"illegal transition {task.state.value} -> rejected")
        task.state = HandoffState.REJECTED
        task._log("rejected", reason, actor)
    return task


def resume(task: HandoffTask, downstream: Callable[[HandoffTask], None]) -> None:
    """校验通过后自动续跑下游，无需人工再点一次。"""
    if task.state != HandoffState.VALIDATED:
        raise ValueError("only validated task can resume")
    downstream(task)
    if not validate_transition(task.state, HandoffState.RESUMED):
        raise ValueError(f"illegal transition {task.state.value} -> resumed")
    task.state = HandoffState.RESUMED
    task._log("resumed", "downstream triggered")


def check_timeout(task: HandoffTask, now: Optional[datetime] = None) -> str:
    """返回 'ok' / 'remind' / 'expired'；红线任务超时不允许自动降级通过。"""
    now = now or datetime.now()
    deadline = datetime.strptime(task.sla_deadline, "%Y-%m-%d %H:%M:%S")
    total = SLA_HOURS.get(task.htype, 24)
    left = (deadline - now).total_seconds() / 3600.0
    if left <= 0:
        task.state = HandoffState.EXPIRED
        task._log(
            "expired",
            "red_line_block" if task.htype in RED_LINE_TYPES else "downgrade_allowed",
        )
        return "expired"
    if left <= total * 0.25 and task.reminders < 3:
        task.reminders += 1
        task._log("remind", f"level={task.reminders}")
        return "remind"
    return "ok"


def can_auto_downgrade(task: HandoffTask) -> bool:
    """红线任务永不允许自动降级通过（授权 / 发布终审）。"""
    return task.htype not in RED_LINE_TYPES


class HandoffBus:
    """接缝总线门面：提供任务全生命周期管理。"""

    def __init__(self):
        self._tasks: Dict[str, HandoffTask] = {}

    def create(
        self,
        task_id: str,
        htype: HandoffType,
        project_id: str,
        title: str,
        payload: Optional[Dict[str, Any]] = None,
        assignee: str = "",
    ) -> HandoffTask:
        task = create_task(task_id, htype, project_id, title, payload, assignee)
        self._tasks[task_id] = task
        return task

    def get(self, task_id: str) -> Optional[HandoffTask]:
        return self._tasks.get(task_id)

    def dispatch(self, task_id: str, assignee: str = "") -> HandoffTask:
        task = self._tasks[task_id]
        return dispatch(task, assignee)

    def accept(self, task_id: str, actor: str) -> HandoffTask:
        task = self._tasks[task_id]
        return accept(task, actor)

    def submit(self, task_id: str, payload: Dict[str, Any], actor: str) -> HandoffTask:
        task = self._tasks[task_id]
        return submit(task, payload, actor)

    def validate(self, task_id: str, validator: Callable[[HandoffTask], tuple], actor: str = "system") -> HandoffTask:
        task = self._tasks[task_id]
        return validate(task, validator, actor)

    def resume(self, task_id: str, downstream: Callable[[HandoffTask], None]) -> None:
        task = self._tasks[task_id]
        return resume(task, downstream)

    def check_timeouts(self, now: Optional[datetime] = None) -> Dict[str, str]:
        """批量检查超时，返回 task_id -> status 映射。"""
        results = {}
        for task_id, task in self._tasks.items():
            if task.state in (HandoffState.CREATED, HandoffState.DISPATCHED, HandoffState.IN_PROGRESS):
                results[task_id] = check_timeout(task, now)
        return results

    def list_tasks(
        self,
        state: Optional[HandoffState] = None,
        htype: Optional[HandoffType] = None,
        project_id: Optional[str] = None,
    ) -> list[HandoffTask]:
        tasks = list(self._tasks.values())
        if state:
            tasks = [t for t in tasks if t.state == state]
        if htype:
            tasks = [t for t in tasks if t.htype == htype]
        if project_id:
            tasks = [t for t in tasks if t.project_id == project_id]
        return tasks


# 全局单例
_bus: Optional[HandoffBus] = None


def get_bus() -> HandoffBus:
    global _bus
    if _bus is None:
        _bus = HandoffBus()
    return _bus