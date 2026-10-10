# -*- coding: utf-8 -*-
# file: backend/pro/scheduler.py
# 作用：算力调度与降级，在成本可控前提下，保证专业管线作业的吞吐与稳定。
# 依赖：仅 Python 标准库
import time
import heapq
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Callable


class TaskPriority(Enum):
    HIGH = 1
    NORMAL = 2
    LOW = 3


class TaskStatus(Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"


@dataclass
class ProRenderTask:
    """专业管线渲染任务"""
    task_id: str
    pipeline: str          # ae_nuke / maya_nuke
    shot_id: str
    version: str
    priority: TaskPriority = TaskPriority.NORMAL
    payload: Dict = field(default_factory=dict)
    status: TaskStatus = TaskStatus.PENDING
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    scheduled_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    retries: int = 0
    max_retries: int = 2
    render_tier: str = "local"  # local / cloud / cpu_fallback
    assigned_node: Optional[str] = None
    cost_estimate: float = 0.0
    actual_cost: float = 0.0
    error: Optional[str] = None


class ProScheduler:
    """专业管线调度器：本地优先 -> 云溢出 -> CPU 降级，成本上限保护。"""

    def __init__(self,
                 local_nodes: int = 4,
                 cloud_timeout_sec: int = 900,      # 队列等待超时溢出云（默认 15 分钟）
                 max_retries: int = 2,
                 daily_cost_limit: float = 500.0,   # 单日成本上限（美元）
                 cost_per_core_hour: float = 0.49): # 云渲染单价（元/核时）
        self._queue: List[tuple] = []  # (priority, created_at, task_id)
        self._tasks: Dict[str, ProRenderTask] = {}
        self._local_nodes = local_nodes
        self._cloud_timeout = cloud_timeout_sec
        self._max_retries = max_retries
        self._daily_cost_limit = daily_cost_limit
        self._cost_per_core_hour = cost_per_core_hour
        self._daily_cost = 0.0
        self._lock = threading.Lock()
        self._node_health: Dict[str, bool] = {}  # node_id -> healthy
        self._running_tasks: Dict[str, ProRenderTask] = {}

    def submit(self, task: ProRenderTask) -> str:
        """提交任务到调度队列。"""
        with self._lock:
            self._tasks[task.task_id] = task
            heapq.heappush(self._queue, (task.priority.value, task.created_at, task.task_id))
        return task.task_id

    def _select_node(self) -> Optional[str]:
        """选择可用渲染节点。"""
        # 简化：返回第一个健康的本地节点
        for i in range(self._local_nodes):
            node_id = f"local_node_{i}"
            if self._node_health.get(node_id, True):
                return node_id
        return None

    def _estimate_cost(self, task: ProRenderTask) -> float:
        """估算任务成本（简化：按时长估算）。"""
        # 实际应根据分辨率、帧数、采样数等估算
        return task.cost_estimate or 10.0

    def process_queue(self) -> int:
        """处理调度队列，返回本轮执行的任务数。"""
        executed = 0
        with self._lock:
            now = datetime.now()
            # 筛选可执行任务
            ready = []
            while self._queue:
                _, _, task_id = self._queue[0]
                task = self._tasks.get(task_id)
                if not task:
                    heapq.heappop(self._queue)
                    continue
                if task.status not in (TaskStatus.PENDING, TaskStatus.QUEUED, TaskStatus.RETRYING):
                    heapq.heappop(self._queue)
                    continue
                # 检查是否到达调度时间
                if task.scheduled_at and datetime.fromisoformat(task.scheduled_at) > datetime.now():
                    break
                # 检查依赖（简化：无依赖模型）
                heapq.heappop(self._queue)
                ready.append(task)

            # 按优先级排序执行
            ready.sort(key=lambda t: (t.priority.value, t.created_at))

            for task in ready:
                if self._execute_task(task):
                    executed += 1
        return executed

    def _execute_task(self, task: ProRenderTask) -> bool:
        """执行单个任务（同步阻塞，实际应异步/Worker 执行）。"""
        node = self._select_node()
        if not node:
            # 本地无空闲，尝试溢出云
            if self._try_spill_to_cloud(task):
                task.render_tier = "cloud"
            else:
                task.status = TaskStatus.QUEUED
                return False

        task.status = TaskStatus.RUNNING
        task.started_at = datetime.now().isoformat()
        task.assigned_node = node
        self._running_tasks[task.task_id] = task

        # 模拟执行（实际应调用渲染 Worker）
        success = self._run_render(task)

        if success:
            task.status = TaskStatus.COMPLETED
            task.completed_at = datetime.now().isoformat()
            self._daily_cost += task.actual_cost
        else:
            self._handle_failure(task)

        self._running_tasks.pop(task.task_id, None)
        return success

    def _try_spill_to_cloud(self, task: ProRenderTask) -> bool:
        """尝试溢出到云渲染农场。"""
        # 成本检查
        est = self._estimate_cost(task)
        if self._daily_cost + est > self._daily_cost_limit:
            return False
        # 实际应调用云渲染 API 提交作业
        # 这里简化为直接标记为 cloud 并在本地模拟
        task.render_tier = "cloud"
        return True

    def _run_render(self, task: ProRenderTask) -> bool:
        """模拟渲染执行。实际应调用渲染 Worker。"""
        # 模拟渲染耗时
        time.sleep(0.1)
        task.actual_cost = self._estimate_cost(task)
        return True

    def _handle_failure(self, task: ProRenderTask) -> None:
        """失败处理：重试或标记失败。"""
        task.retries += 1
        if task.retries <= task.max_retries:
            task.status = TaskStatus.RETRYING
            # 指数退避
            delay = (2 ** task.retries) * 60
            task.scheduled_at = (datetime.now() + timedelta(seconds=delay)).isoformat()
            heapq.heappush(self._queue, (task.priority.value, task.scheduled_at, task.task_id))
        else:
            task.status = TaskStatus.FAILED
            task.error = "Max retries exceeded"

    def get_daily_cost(self) -> float:
        return self._daily_cost

    def get_task_status(self, task_id: str) -> Optional[TaskStatus]:
        task = self.get_task(task_id)
        return task.status if task else None

    def get_task(self, task_id: str) -> Optional[ProRenderTask]:
        return self._tasks.get(task_id)

    def reset_daily_cost(self) -> None:
        """每日重置成本统计。"""
        with self._lock:
            self._daily_cost = 0.0


if __name__ == "__main__":
    sched = ProScheduler(local_nodes=2, daily_cost_limit=100)
    # 提交测试任务
    for i in range(5):
        t = ProRenderTask(
            task_id=f"task_{i}",
            pipeline="ae_nuke",
            shot_id=f"sh00{i}",
            version="v001",
            priority=TaskPriority.HIGH if i == 0 else TaskPriority.NORMAL,
            cost_estimate=20.0,
        )
        sched.submit(t)
    print("Submitted 5 tasks")
    # 运行一次调度
    executed = sched.process_queue()
    print(f"Executed: {executed} tasks")
    print(f"Daily cost: {sched.get_daily_cost():.2f}")