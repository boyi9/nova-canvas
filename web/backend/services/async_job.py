# -*- coding: utf-8 -*-
# file: backend/services/async_job.py
# 作用：NC-CAP-08 异步三层补偿与幂等
# 三层：回调接收 → 延迟队列补偿(30s) → 定时兜底轮询
# 幂等：以任务 ID 唯一性约束，重复回调只生效一次
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional
from enum import Enum

from web.backend.services.db import Database


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    CALLBACK_RECEIVED = "callback_received"
    COMPLETED = "completed"
    FAILED = "failed"
    COMPENSATED = "compensated"  # 补偿后完成


# 回调超时阈值（秒）
CALLBACK_TIMEOUT_S = 30.0

# SQLite 命名空间
_NS_JOB = "async.job"
_NS_QUEUE = "async.compensation_queue"
_JOB_KEY = "__queue__"


@dataclass
class AsyncJob:
    """异步任务"""
    task_id: str
    status: JobStatus = JobStatus.PENDING
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    callback_count: int = 0  # 回调次数（幂等校验）
    result: Optional[Any] = None
    error: Optional[str] = None
    compensated: bool = False


class AsyncJobManager:
    """
    异步任务管理器：三层补偿 + 幂等。

    层 1：回调接口只做接收与落库（<200ms 响应）
    层 2：延迟队列补偿 —— 回调超时 30s 后自动重查
    层 3：定时兜底 —— 按任务 ID 轮询至终态

    幂等：以 task_id 唯一性约束，重复回调只生效一次
    """

    def __init__(
        self,
        callback_timeout_s: float = CALLBACK_TIMEOUT_S,
        poller_fn: Optional[Callable[[str], Any]] = None,
        persist: bool = False,
    ):
        """
        :param persist: 是否落 SQLite。应用单例（get_manager）传 True 以获得重启不丢的
            幂等计数与补偿队列；按需临时创建的实例默认 False，保持彼此隔离。
        """
        self.callback_timeout_s = callback_timeout_s
        self.poller_fn = poller_fn  # 定时兜底轮询函数
        self.persist = persist
        self._jobs: Dict[str, AsyncJob] = {}
        self._compensation_queue: List[str] = []  # 待补偿 task_id
        if self.persist:
            self._load()

    # ── 持久化 ────────────────────────────────────────────────────────────
    def _db(self) -> Database:
        return Database.instance()

    def _load(self) -> None:
        """从 SQLite 恢复任务与补偿队列（重启不丢幂等计数）。"""
        try:
            for item in self._db().list(_NS_JOB):
                doc_id = item.pop("_id", None)
                if not doc_id:
                    continue
                fields = {k: v for k, v in item.items() if k in AsyncJob.__dataclass_fields__}
                if "status" in fields:
                    fields["status"] = JobStatus(fields["status"])
                self._jobs[doc_id] = AsyncJob(**fields)
            q = self._db().get(_NS_QUEUE, _JOB_KEY) or {}
            self._compensation_queue = list(q.get("task_ids", []))
        except Exception:
            self._jobs = {}
            self._compensation_queue = []

    def _persist_job(self, task_id: str) -> None:
        job = self._jobs.get(task_id)
        if job is None:
            return
        if not self.persist:
            return
        try:
            payload = asdict(job)
            payload["status"] = job.status.value
            self._db().put(_NS_JOB, task_id, payload)
        except Exception:
            # 落盘失败不阻断主流程
            pass

    def _persist_queue(self) -> None:
        if not self.persist:
            return
        try:
            self._db().put(_NS_QUEUE, _JOB_KEY, {"task_ids": self._compensation_queue})
        except Exception:
            pass

    def create_job(self, task_id: str) -> AsyncJob:
        """创建异步任务"""
        if task_id in self._jobs:
            return self._jobs[task_id]  # 幂等：已存在则返回
        job = AsyncJob(task_id=task_id)
        self._jobs[task_id] = job
        self._compensation_queue.append(task_id)
        self._persist_job(task_id)
        self._persist_queue()
        return job

    def receive_callback(
        self,
        task_id: str,
        result: Any = None,
        error: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        层 1：接收回调。响应 <200ms，不做重逻辑。
        幂等：重复回调只生效一次。
        """
        if task_id not in self._jobs:
            # 未知任务：记录但不报错（可能回调先到）
            self._jobs[task_id] = AsyncJob(
                task_id=task_id,
                status=JobStatus.CALLBACK_RECEIVED,
                callback_count=1,
                result=result,
                error=error,
            )
            self._persist_job(task_id)
            return {"accepted": True, "duplicate": False, "first_time": True}

        job = self._jobs[task_id]
        job.callback_count += 1

        # 幂等：第二次及以后的回调不改变状态
        if job.callback_count > 1:
            self._persist_job(task_id)
            return {
                "accepted": True,
                "duplicate": True,
                "first_time": False,
                "callback_count": job.callback_count,
            }

        # 第一次回调：更新状态
        if error:
            job.status = JobStatus.FAILED
            job.error = error
        else:
            job.status = JobStatus.COMPLETED
            job.result = result
        job.updated_at = time.time()
        self._persist_job(task_id)

        # 从补偿队列移除
        if task_id in self._compensation_queue:
            self._compensation_queue.remove(task_id)
            self._persist_queue()

        return {"accepted": True, "duplicate": False, "first_time": True}

    def check_timeouts(self, now: Optional[float] = None) -> List[str]:
        """
        层 2：延迟队列补偿 —— 回调超时 30s 后自动重查。
        返回需要补偿的 task_id 列表。
        """
        now = now or time.time()
        to_compensate: List[str] = []

        for task_id in list(self._compensation_queue):
            job = self._jobs.get(task_id)
            if not job:
                continue
            if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.COMPENSATED):
                self._compensation_queue.remove(task_id)
                continue
            elapsed = now - job.created_at
            if elapsed >= self.callback_timeout_s:
                to_compensate.append(task_id)

        return to_compensate

    def compensate(self, task_id: str) -> AsyncJob:
        """
        执行补偿：调用 poller_fn 重查任务状态。
        """
        job = self._jobs.get(task_id)
        if not job:
            raise KeyError(f"任务 '{task_id}' 不存在")
        if self.poller_fn:
            try:
                result = self.poller_fn(task_id)
                job.status = JobStatus.COMPENSATED
                job.result = result
                job.compensated = True
                job.updated_at = time.time()
            except Exception as e:
                job.status = JobStatus.FAILED
                job.error = f"补偿失败: {e}"
                job.updated_at = time.time()
        else:
            # 无 poller_fn：标记为补偿尝试但未完成
            job.compensated = True
            job.updated_at = time.time()

        if task_id in self._compensation_queue:
            self._compensation_queue.remove(task_id)
            self._persist_queue()

        self._persist_job(task_id)
        return job

    def run_compensation_pass(self) -> List[str]:
        """执行一轮补偿检查并处理"""
        to_compensate = self.check_timeouts()
        compensated = []
        for task_id in to_compensate:
            self.compensate(task_id)
            compensated.append(task_id)
        return compensated

    def poll_until_terminal(
        self,
        task_id: str,
        max_polls: int = 10,
        poll_interval_s: float = 1.0,
    ) -> AsyncJob:
        """
        层 3：定时兜底 —— 按任务 ID 轮询至终态。
        """
        job = self._jobs.get(task_id)
        if not job:
            raise KeyError(f"任务 '{task_id}' 不存在")

        terminal = {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.COMPENSATED}
        for _ in range(max_polls):
            if job.status in terminal:
                return job
            if self.poller_fn:
                try:
                    result = self.poller_fn(task_id)
                    job.status = JobStatus.COMPLETED
                    job.result = result
                    job.updated_at = time.time()
                    self._persist_job(task_id)
                    return job
                except Exception as e:
                    job.error = str(e)
            time.sleep(poll_interval_s)

        return job

    def get_job(self, task_id: str) -> Optional[AsyncJob]:
        return self._jobs.get(task_id)

    def success_rate(self) -> float:
        """异步任务最终成功率"""
        if not self._jobs:
            return 1.0
        terminal = {JobStatus.COMPLETED, JobStatus.COMPENSATED}
        succeeded = sum(1 for j in self._jobs.values() if j.status in terminal)
        return succeeded / len(self._jobs)


# 全局单例
_manager: Optional[AsyncJobManager] = None


def get_manager() -> AsyncJobManager:
    global _manager
    if _manager is None:
        _manager = AsyncJobManager(persist=True)
    return _manager


def reset_manager() -> None:
    """测试用：重置单例并清空持久化数据。"""
    global _manager
    _manager = None
    try:
        db = Database.instance()
        db.clear(_NS_JOB)
        db.clear(_NS_QUEUE)
    except Exception:
        pass
