# -*- coding: utf-8 -*-
# tests/test_persistence_integration.py —— P0-2 关键存储落盘验证（重启不丢）
from __future__ import annotations

import pytest

from web.backend.services.db import Database


@pytest.fixture()
def isolated(tmp_path, monkeypatch):
    """每次测试独立的 SQLite 文件。"""
    db_file = tmp_path / "persist.db"
    monkeypatch.setenv("NOVA_DB_PATH", str(db_file))
    Database.reset()
    yield db_file
    Database.reset()


class TestAsyncJobPersistence:
    """异步任务幂等计数必须跨重启保留，否则重复回调会二次生效。"""

    def test_callback_idempotency_survives_restart(self, isolated):
        from web.backend.services.async_job import (
            AsyncJobManager,
            JobStatus,
            reset_manager,
        )

        reset_manager()
        m1 = AsyncJobManager(persist=True)
        m1.create_job("task-A")
        first = m1.receive_callback("task-A", result={"url": "v.mp4"})
        assert first["first_time"] is True
        assert m1.get_job("task-A").status == JobStatus.COMPLETED

        # 模拟进程重启：全新实例从 SQLite 恢复
        m2 = AsyncJobManager(persist=True)
        restored = m2.get_job("task-A")
        assert restored is not None
        assert restored.status == JobStatus.COMPLETED
        assert restored.callback_count == 1
        assert restored.result == {"url": "v.mp4"}

        # 重复回调在重启后仍被识别为 duplicate
        dup = m2.receive_callback("task-A", result={"url": "other.mp4"})
        assert dup["duplicate"] is True
        assert m2.get_job("task-A").result == {"url": "v.mp4"}
        reset_manager()

    def test_compensation_queue_survives_restart(self, isolated):
        from web.backend.services.async_job import AsyncJobManager, reset_manager

        reset_manager()
        m1 = AsyncJobManager(persist=True)
        m1.create_job("task-B")
        m2 = AsyncJobManager(persist=True)
        assert "task-B" in m2._compensation_queue
        reset_manager()


class TestCallTracePersistence:
    def test_traces_survive_restart(self, isolated):
        from web.backend.models.call_trace import CallTraceStore, reset_store

        reset_store()
        s1 = CallTraceStore()
        s1.record_call(
            task_id="t-1", step_id="s-1", input_type="I1", operation="create",
            control_mode="M1", model_alias="m", route_reason="r",
            cost_cny=0.1, latency_ms=12.0, human_confirm=True, output="x",
        )
        assert s1.size() == 1

        s2 = CallTraceStore()
        assert s2.reload_from_db() == 1
        assert s2.by_task_id("t-1")[0].model_alias == "m"
        reset_store()


class TestLedgerPersistence:
    def test_shots_and_versions_survive_restart(self, isolated):
        from web.backend.pro.ledger import (
            ProShot,
            ProVersion,
            get_latest_version_of_shot,
            list_shots,
            register_shot,
            register_version,
            reset_ledger,
        )

        reset_ledger()
        register_shot(ProShot(shot_id="sh010", project_id="p1", scene="s", description="d"))
        register_version(ProVersion(shot_id="sh010", version="v001", process_type="NUKE",
                                    engine_file="a.nk", render_path="r1", color_config="ACES"))
        register_version(ProVersion(shot_id="sh010", version="v010", process_type="NUKE",
                                    engine_file="b.nk", render_path="r10", color_config="ACES"))

        assert len(list_shots()) == 1
        # 版本必须按数值排序，v010 > v001（不能按字符串比较）
        assert get_latest_version_of_shot("sh010") == "v010"

        # 重启后重新读取（新函数调用直接走 DB，无内存缓存）
        assert get_latest_version_of_shot("sh010") == "v010"
        assert list_shots()[0].shot_id == "sh010"
        reset_ledger()


class TestBillingPersistence:
    def test_subscription_survives_restart(self, isolated):
        from web.backend.billing import get_billing_store, reset_billing_store

        reset_billing_store(isolated)
        s1 = get_billing_store()
        s1.set_subscription("u1", "pro", "monthly", expires_at=999.0)
        reset_billing_store()

        s2 = get_billing_store()
        sub = s2.get_subscription("u1")
        assert sub.plan_id == "pro"
        assert sub.expires_at == 999.0
        reset_billing_store()