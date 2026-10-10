# -*- coding: utf-8 -*-
# file: tests/test_cap_async_job.py
# 作用：NC-CAP-08 异步三层补偿与幂等测试
import time
import pytest
from web.backend.services.async_job import (
    AsyncJob,
    AsyncJobManager,
    JobStatus,
    CALLBACK_TIMEOUT_S,
    get_manager,
    reset_manager,
)


class TestCallbackLayer:
    """层 1：回调接收"""

    def test_receive_callback(self):
        """正常回调 → COMPLETED"""
        mgr = AsyncJobManager()
        mgr.create_job("task-001")
        resp = mgr.receive_callback("task-001", result={"url": "video.mp4"})
        assert resp["accepted"]
        assert not resp["duplicate"]
        job = mgr.get_job("task-001")
        assert job.status == JobStatus.COMPLETED
        assert job.result == {"url": "video.mp4"}

    def test_callback_error(self):
        """错误回调 → FAILED"""
        mgr = AsyncJobManager()
        mgr.create_job("task-err")
        mgr.receive_callback("task-err", error="model timeout")
        job = mgr.get_job("task-err")
        assert job.status == JobStatus.FAILED
        assert job.error == "model timeout"

    def test_callback_fast(self):
        """回调接口响应 <200ms（不做重逻辑）"""
        mgr = AsyncJobManager()
        mgr.create_job("task-fast")
        start = time.time()
        mgr.receive_callback("task-fast", result="ok")
        elapsed_ms = (time.time() - start) * 1000
        assert elapsed_ms < 200


class TestIdempotency:
    """幂等：重复回调只生效一次"""

    def test_duplicate_callback(self):
        """模拟重复回调 3 次 → 只生效一次"""
        mgr = AsyncJobManager()
        mgr.create_job("task-dup")

        # 第 1 次
        r1 = mgr.receive_callback("task-dup", result={"v": 1})
        assert r1["first_time"]
        assert not r1["duplicate"]

        # 第 2、3 次
        r2 = mgr.receive_callback("task-dup", result={"v": 2})
        r3 = mgr.receive_callback("task-dup", result={"v": 3})

        assert r2["duplicate"]
        assert r3["duplicate"]

        # 状态不变，结果不变
        job = mgr.get_job("task-dup")
        assert job.status == JobStatus.COMPLETED
        assert job.result == {"v": 1}  # 第一次的结果
        assert job.callback_count == 3


class TestCompensationLayer:
    """层 2：延迟队列补偿"""

    def test_timeout_compensation(self):
        """模拟回调丢失 → 30s 后补偿触发"""
        mgr = AsyncJobManager(callback_timeout_s=0.1)  # 用 0.1s 方便测试
        mgr.create_job("task-lost")

        # 未收到回调，等待超时
        time.sleep(0.15)
        to_compensate = mgr.check_timeouts()
        assert "task-lost" in to_compensate

    def test_compensation_with_poller(self):
        """补偿调用 poller_fn 获取结果"""
        poller_results = {"task-polled": {"status": "done", "url": "ok.mp4"}}

        def poller(task_id):
            return poller_results.get(task_id)

        mgr = AsyncJobManager(callback_timeout_s=0.05, poller_fn=poller)
        mgr.create_job("task-polled")

        time.sleep(0.06)
        compensated = mgr.run_compensation_pass()
        assert "task-polled" in compensated

        job = mgr.get_job("task-polled")
        assert job.status == JobStatus.COMPENSATED
        assert job.result == {"status": "done", "url": "ok.mp4"}

    def test_callback_before_timeout_no_compensation(self):
        """回调先到 → 不补偿"""
        mgr = AsyncJobManager(callback_timeout_s=10)
        mgr.create_job("task-early")
        mgr.receive_callback("task-early", result="ok")

        to_compensate = mgr.check_timeouts()
        assert "task-early" not in to_compensate


class TestPollingLayer:
    """层 3：定时兜底轮询"""

    def test_poll_until_terminal(self):
        """轮询至终态"""
        mgr = AsyncJobManager()
        mgr.create_job("task-poll")

        # 模拟 poller 返回结果
        mgr.poller_fn = lambda tid: {"done": True}
        job = mgr.poll_until_terminal("task-poll", max_polls=3, poll_interval_s=0.01)
        assert job.status == JobStatus.COMPLETED

    def test_poll_already_terminal(self):
        """已是终态直接返回"""
        mgr = AsyncJobManager()
        mgr.create_job("task-done")
        mgr.receive_callback("task-done", result="ok")
        job = mgr.poll_until_terminal("task-done", max_polls=1)
        assert job.status == JobStatus.COMPLETED


class TestSuccessRate:
    """异步任务最终成功率"""

    def test_all_success(self):
        mgr = AsyncJobManager()
        mgr.create_job("t1")
        mgr.create_job("t2")
        mgr.receive_callback("t1", result="a")
        mgr.receive_callback("t2", result="b")
        assert mgr.success_rate() == 1.0

    def test_partial_success(self):
        mgr = AsyncJobManager()
        mgr.create_job("t1")
        mgr.create_job("t2")
        mgr.receive_callback("t1", result="a")
        mgr.receive_callback("t2", error="fail")
        rate = mgr.success_rate()
        assert rate == 0.5

    def test_empty_manager(self):
        mgr = AsyncJobManager()
        assert mgr.success_rate() == 1.0


class TestCreateJobIdempotent:
    """创建任务幂等"""

    def test_create_existing(self):
        mgr = AsyncJobManager()
        j1 = mgr.create_job("task-x")
        j2 = mgr.create_job("task-x")
        assert j1 is j2


class TestGlobalManager:
    """全局单例"""

    def test_get_manager(self):
        reset_manager()
        m1 = get_manager()
        m2 = get_manager()
        assert m1 is m2
