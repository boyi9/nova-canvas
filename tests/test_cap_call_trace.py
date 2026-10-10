# -*- coding: utf-8 -*-
# file: tests/test_cap_call_trace.py
# 作用：NC-CAP-10 留痕与可解释测试
import pytest
from datetime import datetime, timedelta
from web.backend.models.call_trace import (
    CallTrace,
    CallTraceStore,
    compute_output_hash,
    RETENTION_DAYS,
    get_store,
    reset_store,
)


class TestCallTraceFields:
    """13 个字段完整记录"""

    def test_all_fields_present(self):
        """每次调用留痕完整率 100%（字段无缺失）"""
        trace = CallTrace(
            task_id="t1",
            step_id="s1",
            input_type="I1",
            operation="create",
            control_mode="M2",
            model_alias="image-edit-primary",
            route_reason="硬约束通过; score=0.85",
            cost_cny=0.12,
            latency_ms=8500,
            human_confirm=False,
            output_hash="abc123",
            model_version="v5.0",
            prompt_version="v1.0",
        )
        assert trace.is_complete()
        d = trace.to_dict()
        # 13 字段
        expected = {
            "task_id", "step_id", "input_type", "operation",
            "control_mode", "model_alias", "model_version", "prompt_version",
            "route_reason", "cost_cny", "latency_ms", "human_confirm",
            "output_hash", "traced_at",
        }
        assert expected.issubset(set(d.keys()))

    def test_missing_required_field(self):
        """缺必填字段 → is_complete=False"""
        trace = CallTrace(
            task_id="",
            step_id="s1",
            input_type="I1",
            operation="create",
            control_mode="M2",
            model_alias="model-a",
            route_reason="reason",
            cost_cny=0.1,
            latency_ms=100,
            human_confirm=False,
            output_hash="abc",
        )
        assert not trace.is_complete()


class TestOutputHash:
    """输出哈希"""

    def test_string_hash(self):
        h1 = compute_output_hash("hello")
        h2 = compute_output_hash("hello")
        assert h1 == h2

    def test_different_content_different_hash(self):
        h1 = compute_output_hash("hello")
        h2 = compute_output_hash("world")
        assert h1 != h2

    def test_none_hash(self):
        assert compute_output_hash(None) == "null"

    def test_dict_hash(self):
        h = compute_output_hash({"key": "value"})
        assert len(h) == 16  # 截断到 16 位


class TestCallTraceStore:
    """留痕存储"""

    def setUp(self):
        self.store = CallTraceStore()

    def test_record_and_query(self):
        """可按 task_id 还原完整决策链"""
        store = CallTraceStore()
        store.record_call(
            task_id="t1", step_id="s1", input_type="I1",
            operation="create", control_mode="M2",
            model_alias="model-a", route_reason="r1",
            cost_cny=0.1, latency_ms=100, human_confirm=False,
            output="result1",
        )
        store.record_call(
            task_id="t1", step_id="s2", input_type="I2",
            operation="optimize", control_mode="M3",
            model_alias="model-b", route_reason="r2",
            cost_cny=0.2, latency_ms=200, human_confirm=True,
            output="result2",
        )
        traces = store.by_task_id("t1")
        assert len(traces) == 2
        assert traces[0].step_id == "s1"
        assert traces[1].step_id == "s2"

    def test_completeness_rate(self):
        """留痕完整率"""
        store = CallTraceStore()
        store.record_call(
            task_id="t1", step_id="s1", input_type="I1",
            operation="create", control_mode="M2",
            model_alias="model-a", route_reason="r",
            cost_cny=0.1, latency_ms=100, human_confirm=False,
            output="x",
        )
        assert store.completeness_rate() == 1.0

    def test_total_cost(self):
        store = CallTraceStore()
        store.record_call(
            task_id="t1", step_id="s1", input_type="I1",
            operation="create", control_mode="M2",
            model_alias="model-a", route_reason="r",
            cost_cny=0.15, latency_ms=100, human_confirm=False,
            output="x",
        )
        store.record_call(
            task_id="t1", step_id="s2", input_type="I2",
            operation="optimize", control_mode="M3",
            model_alias="model-b", route_reason="r",
            cost_cny=0.25, latency_ms=200, human_confirm=False,
            output="y",
        )
        assert store.total_cost() == 0.40

    def test_by_model(self):
        store = CallTraceStore()
        store.record_call(
            task_id="t1", step_id="s1", input_type="I1",
            operation="create", control_mode="M2",
            model_alias="model-a", route_reason="r",
            cost_cny=0.1, latency_ms=100, human_confirm=False,
            output="x",
        )
        assert len(store.by_model("model-a")) == 1
        assert len(store.by_model("model-b")) == 0

    def test_retention_cleanup(self):
        """保留期 ≥180 天，过期记录被清理"""
        store = CallTraceStore(retention_days=180)
        # 添加一条记录
        store.record_call(
            task_id="t1", step_id="s1", input_type="I1",
            operation="create", control_mode="M2",
            model_alias="model-a", route_reason="r",
            cost_cny=0.1, latency_ms=100, human_confirm=False,
            output="x",
        )
        assert store.size() == 1

        # 手动设置过期时间
        old_time = (datetime.now() - timedelta(days=181)).isoformat()
        store._traces[0].traced_at = old_time

        # 触发清理
        store.record_call(
            task_id="t2", step_id="s1", input_type="I1",
            operation="create", control_mode="M2",
            model_alias="model-a", route_reason="r",
            cost_cny=0.1, latency_ms=100, human_confirm=False,
            output="y",
        )
        # 过期记录被清理
        assert store.size() == 1
        assert store._traces[0].task_id == "t2"

    def test_recent(self):
        store = CallTraceStore()
        for i in range(5):
            store.record_call(
                task_id=f"t{i}", step_id="s1", input_type="I1",
                operation="create", control_mode="M2",
                model_alias="model-a", route_reason="r",
                cost_cny=0.1, latency_ms=100, human_confirm=False,
                output=str(i),
            )
        recent = store.recent(limit=3)
        assert len(recent) == 3


class TestGlobalStore:
    """全局单例"""

    def test_get_store(self):
        reset_store()
        s1 = get_store()
        s2 = get_store()
        assert s1 is s2
