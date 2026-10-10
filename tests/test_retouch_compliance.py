# -*- coding: utf-8 -*-
# file: tests/test_retouch_compliance.py
# 作用：NC-RET-12 合规红线 + NC-RET-08 编排序 + NC-RET-02 引擎路由
import pytest

from web.backend.retouch.compliance import (
    gate_before_execute,
    startup_assert_retouch_config,
)
from web.backend.retouch.engine_router import (
    EngineNotAvailableError,
    resolve_engine,
    resolve_for_op,
)
from web.backend.retouch.orchestrator import execution_plan, order_ops


class TestComplianceGate:
    def test_product_body_altering_blocked(self):
        task = {"spec": {"ops": ["outpaint"]}, "target": "product", "is_auto": False}
        ok, reasons = gate_before_execute(task, {})
        assert ok is False
        assert any("商品本体" in r for r in reasons)

    def test_portrait_ops_require_auth(self):
        task = {"spec": {"ops": ["face_reshape"]}, "target": "portrait"}
        ok, reasons = gate_before_execute(task, {"portrait_granted": False})
        assert ok is False
        ok2, _ = gate_before_execute(task, {"portrait_granted": True})
        assert ok2 is True

    def test_ip_ops_require_clearance(self):
        task = {"spec": {"ops": ["remove_watermark"]}, "target": "any"}
        ok, reasons = gate_before_execute(task, {"ip_cleared": False})
        assert ok is False
        ok2, _ = gate_before_execute(task, {"ip_cleared": True})
        assert ok2 is True

    def test_auto_publish_blocked(self):
        task = {"spec": {"ops": []}, "target": "any", "is_auto": True, "action": "publish"}
        ok, reasons = gate_before_execute(task, {})
        assert ok is False
        assert any("人工确认" in r for r in reasons)

    def test_face_swap_requires_human_confirm(self):
        task = {"spec": {"ops": ["face_swap"]}, "target": "portrait", "human_confirm": False}
        ok, reasons = gate_before_execute(task, {"portrait_granted": True})
        assert ok is False
        assert any("人工最终确认" in r for r in reasons)

    def test_clean_task_passes(self):
        task = {"spec": {"ops": ["skin_smooth"]}, "target": "portrait"}
        ok, reasons = gate_before_execute(task, {})
        assert ok is True
        assert reasons == []

    def test_startup_assert_redline_auto_fails(self):
        with pytest.raises(RuntimeError):
            startup_assert_retouch_config(["skin_smooth", "face_swap"])

    def test_startup_assert_clean_ok(self):
        startup_assert_retouch_config(["skin_smooth", "bg_replace"])


class TestOrchestrator:
    def test_fixed_order(self):
        ops = ["upscale", "remove_watermark", "skin_smooth", "face_reshape", "skin_tone_unify", "blemish_remove"]
        ordered = order_ops(ops)
        assert ordered.index("face_reshape") < ordered.index("skin_tone_unify")
        assert ordered.index("skin_tone_unify") < ordered.index("skin_smooth")
        assert ordered.index("skin_smooth") < ordered.index("blemish_remove")
        assert ordered.index("remove_watermark") < ordered.index("upscale")
        assert ordered[-1] == "upscale"

    def test_dedupe_stable(self):
        assert order_ops(["skin_smooth", "upscale", "skin_smooth"]) == ["skin_smooth", "upscale"]

    def test_execution_plan_steps(self):
        plan = execution_plan(["upscale", "skin_smooth"])
        assert plan[0]["op"] == "skin_smooth"
        assert plan[-1]["op"] == "upscale"
        assert plan[0]["step"] == 1


class TestEngineRouter:
    def test_tier_selects_different_engines(self):
        local = resolve_engine("skin_frequency", "local")
        assert local.local is True
        assert local.cost_cny == 0.0

    def test_flagship_degrades_to_runnable(self):
        choice = resolve_engine("skin_frequency", "flagship")
        assert choice.tier in ("flagship", "balanced", "local")

    def test_require_runnable_picks_local(self):
        choice = resolve_engine("skin_frequency", "flagship", require_runnable=True)
        assert choice.local is True
        assert choice.tier == "local"

    def test_unknown_engine_raises(self):
        with pytest.raises(EngineNotAvailableError):
            resolve_engine("no_such_engine", "balanced")

    def test_external_only_op_raises_when_runnable_required(self):
        with pytest.raises(EngineNotAvailableError):
            resolve_for_op("bg_replace", "bg_replace", "balanced", require_runnable=True)

    def test_resolve_for_op_external_ok_without_runnable_flag(self):
        choice = resolve_for_op("bg_replace", "bg_replace", "balanced")
        assert choice.local is False
