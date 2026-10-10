"""无人值守调度器：任务日历、依赖编排、配额管理、崩溃续跑。"""
from __future__ import annotations

import hashlib
import json
import os
import random
import secrets
import time as time_module
from dataclasses import dataclass, asdict, field
from datetime import datetime, timedelta, time
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set

from .handoff_bus import get_bus, HandoffBus
from .handoff_models import HandoffType, HandoffState
from .matrix_manager import get_matrix_manager, MatrixManager
from .account_auth import get_auth_manager, AccountAuthManager


class TaskPriority(Enum):
    HIGH = 1
    NORMAL = 2
    LOW = 3


class TaskStatus(Enum):
    PENDING = "pending"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    CANCELLED = "cancelled"


@dataclass
class ScheduledTask:
    """调度任务。"""
    task_id: str
    name: str
    account_id: str
    platform: str
    action: str  # 发布/生成/质检等
    payload: Dict[str, Any]
    priority: TaskPriority = TaskPriority.NORMAL
    scheduled_at: str = ""
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    status: TaskStatus = TaskStatus.PENDING
    retry_count: int = 0
    max_retries: int = 3
    idempotency_key: str = ""
    depends_on: List[str] = field(default_factory=list)  # 依赖的 task_id
    assigned_worker: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None

    def __post_init__(self):
        if not self.scheduled_at:
            self.scheduled_at = datetime.now().isoformat()
        if not self.idempotency_key:
            self.idempotency_key = self._gen_idempotency_key()

    def _gen_idempotency_key(self) -> str:
        """发布幂等键 = sha256(account_id + content_hash + 计划日期)。"""
        content = json.dumps(self.payload, sort_keys=True, ensure_ascii=False)
        date_str = datetime.now().date().isoformat()
        raw = f"{self.account_id}:{content}:{date_str}"
        return hashlib.sha256(raw.encode()).hexdigest()


@dataclass
class DailyReport:
    """日报。"""
    date: str
    account_id: str
    total_tasks: int
    completed: int
    failed: int
    total_gmv: float = 0.0
    total_views: int = 0
    actions: List[Dict[str, Any]] = field(default_factory=list)
    next_day_plan: List[Dict[str, Any]] = field(default_factory=list)
    generated_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class WeeklyReport:
    """周报。"""
    week_start: str
    week_end: str
    account_id: str
    strategy_review: Dict[str, Any] = field(default_factory=dict)
    next_week_plan: List[Dict[str, Any]] = field(default_factory=list)
    generated_at: str = field(default_factory=lambda: datetime.now().isoformat())


class AutopilotScheduler:
    """无人值守调度器。"""

    def __init__(
        self,
        handoff_bus: Optional[HandoffBus] = None,
        matrix_manager: Optional[MatrixManager] = None,
        auth_manager: Optional[AccountAuthManager] = None,
    ):
        self._bus = handoff_bus or get_bus()
        self._matrix = matrix_manager or get_matrix_manager()
        self._auth = auth_manager or get_auth_manager()
        self._tasks: Dict[str, ScheduledTask] = {}
        self._worker_id = f"worker_{secrets.token_hex(8)}"
        self._running = False
        self._daily_reports: Dict[str, DailyReport] = {}
        self._weekly_reports: Dict[str, WeeklyReport] = {}
        # 幂等记录：idempotency_key -> 执行时刻（epoch 秒），TTL 24h
        self._executed_keys: Dict[str, float] = {}

    def add_task(
        self,
        name: str,
        account_id: str,
        platform: str,
        action: str,
        payload: Dict[str, Any],
        scheduled_at: Optional[datetime] = None,
        priority: TaskPriority = TaskPriority.NORMAL,
        depends_on: Optional[List[str]] = None,
        max_retries: int = 3,
    ) -> ScheduledTask:
        """添加调度任务。"""
        # 处理 scheduled_at：支持 datetime 对象或 ISO 格式字符串
        if scheduled_at is None:
            scheduled_at = datetime.now()
        elif isinstance(scheduled_at, str):
            scheduled_at = datetime.fromisoformat(scheduled_at)

        task = ScheduledTask(
            task_id=f"sched_{secrets.token_urlsafe(12)}",
            name=name,
            account_id=account_id,
            platform=platform,
            action=action,
            payload=payload,
            priority=priority,
            scheduled_at=scheduled_at.isoformat(),
            depends_on=depends_on or [],
            max_retries=max_retries,
        )
        self._tasks[task.task_id] = task
        return task

    def schedule_publish(
        self,
        account_id: str,
        content: Dict[str, Any],
        preferred_time: Optional[time] = None,
    ) -> ScheduledTask:
        """调度发布任务（带抖动、配额检查）。"""
        matrix = self._matrix
        account = matrix.get_account(account_id)
        if not account:
            raise ValueError("Account not found")

        # 检查发布权限
        can_pub = matrix.can_publish(account_id)
        if not can_pub["allowed"]:
            raise ValueError(f"Cannot publish: {can_pub['reason']}")

        # 计算发布时间（带抖动）
        publish_time = matrix.get_publish_window(account, preferred_time)

        # 检查配额
        auth = self._auth.get_authorization(account.auth_id)
        if auth:
            quota = self._auth.check_quota(auth.id)
            if not quota["allowed"]:
                raise ValueError("Daily quota exceeded")

        # 创建幂等键
        content_hash = hashlib.sha256(
            json.dumps(content, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()[:16]
        idem_key = f"{account_id}:{content_hash}:{publish_time.date().isoformat()}"

        # 检查是否已调度过相同内容
        for t in self._tasks.values():
            if t.idempotency_key == idem_key:
                raise ValueError("Duplicate content already scheduled for today")

        task = self.add_task(
            name="publish_video",
            account_id=account_id,
            platform=account.platform,
            action="publish",
            payload={"content": content, "idempotency_key": idem_key},
            scheduled_at=publish_time,
            priority=TaskPriority.HIGH,
            max_retries=2,
        )
        task.idempotency_key = idem_key
        return task

    def schedule_daily_tasks(self, account_ids: List[str]) -> List[ScheduledTask]:
        """根据最佳发布时段生成每日任务日历。"""
        tasks = []
        for account_id in account_ids:
            account = self._matrix.get_account(account_id)
            if not account or account.status != "active":
                continue

            # 获取该账号的最佳发布时段（来自爆款洞察/账号监控）
            best_slots = self._get_best_publish_slots(account)

            for slot in best_slots:
                # 检查配额
                auth = self._auth.get_authorization(account.auth_id)
                if auth:
                    quota = self._auth.check_quota(auth.id)
                    if not quota["allowed"] or quota["remaining"] <= 0:
                        break

                # 为每个时段创建占位任务（实际内容由运营 Agent 生成）
                scheduled = datetime.combine(datetime.now().date() + timedelta(days=1), slot)
                task = self.add_task(
                    name="daily_publish_slot",
                    account_id=account_id,
                    platform=account.platform,
                    action="publish_placeholder",
                    payload={"slot": slot.isoformat(), "content_source": "ops_agent"},
                    scheduled_at=scheduled,
                    priority=TaskPriority.NORMAL,
                )
                tasks.append(task)

        return tasks

    def _get_best_publish_slots(self, account: Any) -> List[time]:
        """获取最佳发布时段（简化：固定时段 + 随机抖动）。"""
        # 实际应从爆款洞察/账号监控获取粉丝活跃时段
        base_slots = [time(10, 30), time(12, 0), time(14, 30), time(19, 0), time(21, 30)]
        # 随机选择 2-3 个时段
        selected = random.sample(base_slots, k=min(3, len(base_slots)))
        return selected

    def run_task(self, task_id: str) -> bool:
        """执行单个任务（含重试、依赖检查）。"""
        task = self._tasks.get(task_id)
        if not task:
            return False

        # 检查依赖
        for dep_id in task.depends_on:
            dep = self._tasks.get(dep_id)
            if not dep or dep.status != TaskStatus.COMPLETED:
                return False  # 依赖未满足

        # 检查幂等键（防重复执行）
        if self._check_idempotency(task):
            task.status = TaskStatus.COMPLETED
            task.completed_at = datetime.now().isoformat()
            return True

        task.status = TaskStatus.RUNNING
        task.started_at = datetime.now().isoformat()
        task.assigned_worker = self._worker_id

        try:
            success = self._execute_action(task)
            if success:
                task.status = TaskStatus.COMPLETED
                task.completed_at = datetime.now().isoformat()
                self._record_idempotency(task)
            else:
                self._handle_failure(task)
            return success
        except Exception as e:
            task.error = str(e)
            self._handle_failure(task)
            return False

    def _check_idempotency(self, task: ScheduledTask) -> bool:
        """检查幂等键是否已执行（内存实现，TTL 24h；生产应落 Redis）。"""
        self._purge_expired_idempotency()
        return task.idempotency_key in self._executed_keys

    def _record_idempotency(self, task: ScheduledTask) -> None:
        """记录幂等键已执行（TTL 24h）。"""
        self._executed_keys[task.idempotency_key] = time_module.time()

    def _purge_expired_idempotency(self) -> None:
        cutoff = time_module.time() - 86400.0
        expired = [k for k, ts in self._executed_keys.items() if ts < cutoff]
        for k in expired:
            del self._executed_keys[k]

    def _execute_action(self, task: ScheduledTask) -> bool:
        """执行具体动作。"""
        action = task.action
        payload = task.payload

        if action == "publish":
            return self._execute_publish(task)
        elif action == "generate_video":
            return self._execute_generate(task)
        elif action == "rough_cut":
            return self._execute_rough_cut(task)
        elif action == "fine_cut":
            return self._execute_fine_cut(task)
        elif action == "package":
            return self._execute_package(task)
        elif action == "bgm_match":
            return self._execute_bgm(task)
        elif action == "compliance_precheck":
            return self._execute_compliance(task)
        elif action == "handoff_dispatch":
            return self._execute_handoff(task)
        elif action == "draft_export":
            return self._execute_draft_export(task)
        elif action == "data_pull":
            return self._execute_data_pull(task)
        elif action == "report_generate":
            return self._execute_report(task)
        else:
            task.error = f"Unknown action: {action}"
            return False

    def _execute_publish(self, task: ScheduledTask) -> bool:
        """执行发布（实际应调平台 API）。"""
        # 实际：调用平台发布 API，消耗配额
        account = self._matrix.get_account(task.account_id)
        if account:
            auth = self._auth.get_authorization(account.auth_id)
            if auth:
                self._auth.consume_quota(auth.id)
        return True  # 模拟成功

    def _execute_generate(self, task: ScheduledTask) -> bool:
        return True

    def _execute_rough_cut(self, task: ScheduledTask) -> bool:
        return True

    def _execute_fine_cut(self, task: ScheduledTask) -> bool:
        return True

    def _execute_package(self, task: ScheduledTask) -> bool:
        return True

    def _execute_bgm(self, task: ScheduledTask) -> bool:
        return True

    def _execute_compliance(self, task: ScheduledTask) -> bool:
        return True

    def _execute_handoff(self, task: ScheduledTask) -> bool:
        return True

    def _execute_draft_export(self, task: ScheduledTask) -> bool:
        return True

    def _execute_data_pull(self, task: ScheduledTask) -> bool:
        return True

    def _execute_report(self, task: ScheduledTask) -> bool:
        return True

    def _handle_failure(self, task: ScheduledTask) -> None:
        """失败处理：重试或标记失败。"""
        task.retry_count += 1
        if task.retry_count <= task.max_retries:
            task.status = TaskStatus.RETRYING
            # 指数退避：2^retry * 60 秒
            delay = (2 ** task.retry_count) * 60
            task.scheduled_at = (datetime.now() + timedelta(seconds=delay)).isoformat()
        else:
            task.status = TaskStatus.FAILED
            task.completed_at = datetime.now().isoformat()

    def process_queue(self) -> int:
        """处理任务队列（按优先级、时间排序）。"""
        now = datetime.now()
        # 筛选可执行任务
        runnable = [
            t for t in self._tasks.values()
            if t.status in (TaskStatus.PENDING, TaskStatus.SCHEDULED, TaskStatus.RETRYING)
            and datetime.fromisoformat(t.scheduled_at) <= now
            and self._dependencies_met(t)
        ]
        # 排序：优先级 > 时间
        runnable.sort(key=lambda t: (t.priority.value, t.scheduled_at))

        executed = 0
        for task in runnable:
            if self.run_task(task.task_id):
                executed += 1
        return executed

    def _dependencies_met(self, task: ScheduledTask) -> bool:
        for dep_id in task.depends_on:
            dep = self._tasks.get(dep_id)
            if not dep or dep.status != TaskStatus.COMPLETED:
                return False
        return True

    def recover_crashed_tasks(self) -> int:
        """崩溃续跑：服务重启后恢复未完成队列，不重复发布。"""
        recovered = 0
        for task in self._tasks.values():
            if task.status in (TaskStatus.RUNNING, TaskStatus.RETRYING, TaskStatus.SCHEDULED):
                # 检查幂等键：如果已执行则跳过
                if self._check_idempotency(task):
                    task.status = TaskStatus.COMPLETED
                    task.completed_at = datetime.now().isoformat()
                    recovered += 1
                else:
                    # 重置为待执行
                    if task.status == TaskStatus.RUNNING:
                        task.status = TaskStatus.PENDING
                    recovered += 1
        return recovered

    def generate_daily_report(self, account_id: str) -> DailyReport:
        """生成每日 09:00 报告。"""
        account = self._matrix.get_account(account_id)
        today = datetime.now().date().isoformat()

        # 统计今日任务
        today_tasks = [
            t for t in self._tasks.values()
            if t.account_id == account_id
            and t.created_at.startswith(today)
        ]

        report = DailyReport(
            date=today,
            account_id=account_id,
            total_tasks=len(today_tasks),
            completed=sum(1 for t in today_tasks if t.status == TaskStatus.COMPLETED),
            failed=sum(1 for t in today_tasks if t.status == TaskStatus.FAILED),
            actions=[{"task": t.name, "status": t.status.value, "time": t.completed_at} for t in today_tasks],
        )
        self._daily_reports[today] = report
        return report

    def generate_weekly_report(self, account_id: str) -> WeeklyReport:
        """生成周一 10:00 策略复盘报告（与 Pilot 周复盘合并）。"""
        week_start = (datetime.now() - timedelta(days=datetime.now().weekday())).date().isoformat()
        week_end = (datetime.now() + timedelta(days=6 - datetime.now().weekday())).date().isoformat()

        report = WeeklyReport(
            week_start=week_start,
            week_end=week_end,
            account_id=account_id,
        )
        self._weekly_reports[week_start] = report
        return report

    def get_pending_tasks(self, account_id: Optional[str] = None) -> List[ScheduledTask]:
        """获取待执行任务（驾驶舱用）。"""
        tasks = list(self._tasks.values())
        if account_id:
            tasks = [t for t in tasks if t.account_id == account_id]
        return [t for t in tasks if t.status in (TaskStatus.PENDING, TaskStatus.SCHEDULED, TaskStatus.RETRYING)]


# 全局调度器
_scheduler: Optional[AutopilotScheduler] = None


def get_scheduler() -> AutopilotScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AutopilotScheduler()
    return _scheduler


def run_scheduler_worker(interval_seconds: int = 60, once: bool = False) -> None:
    """运行调度器 Worker（定时处理队列）。"""
    scheduler = get_scheduler()
    # 启动时先做崩溃续跑
    scheduler.recover_crashed_tasks()

    import signal
    shutdown = False

    def _signal_handler(signum, frame):
        nonlocal shutdown
        shutdown = True

    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    while not shutdown:
        try:
            scheduler.process_queue()
        except Exception as e:
            print(f"[{datetime.now()}] Scheduler error: {e}")

        if once:
            break
        time_module.sleep(interval_seconds)


if __name__ == "__main__":
    # Demo
    import signal
    sched = AutopilotScheduler()
    # 添加测试任务
    task = sched.schedule_publish(
        account_id="macc_test",
        content={"video_url": "s3://bucket/video.mp4", "title": "测试视频"},
    )
    print(f"Scheduled task: {task.task_id} at {task.scheduled_at}")

    # 运行一次
    run_scheduler_worker(interval_seconds=10, once=True)