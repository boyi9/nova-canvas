# -*- coding: utf-8 -*-
# tests/test_fuse_real_monitors.py —— P1-1 熔断器接真实数据源
# 验证要点：4 个默认 monitor 能从真实事件流算出指标并触发熔断
from __future__ import annotations

import pytest

from web.backend.host.account_metrics import (
    AccountMetricsStore,
    reset_metrics_store,
)
from web.backend.host.fuse import (
    FuseManager,
    FuseType,
    default_budget_monitor,
    default_drop_monitor,
    default_failure_monitor,
    default_rule_alert_monitor,
    register_default_monitors,
)
from web.backend.services.db import Database


@pytest.fixture(autouse=True)
def _clean(tmp_path, monkeypatch):
    monkeypatch.setenv("NOVA_DB_PATH", str(tmp_path / "fuse.db"))
    Database.reset()
    reset_metrics_store()
    yield
    Database.reset()
    reset_metrics_store()


@pytest.fixture()
def metrics() -> AccountMetricsStore:
    return AccountMetricsStore()


class TestFailureMonitor:
    def test_zero_when_no_data(self):
        assert default_failure_monitor("acc-1")["consecutive_failures"] == 0

    def test_counts_consecutive_failures(self, metrics):
        for _ in range(3):
            metrics.record_task_result("acc-1", ok=False)
        assert default_failure_monitor("acc-1")["consecutive_failures"] == 3

    def test_success_resets_counter(self, metrics):
        metrics.record_task_result("acc-1", ok=False)
        metrics.record_task_result("acc-1", ok=False)
        metrics.record_task_result("acc-1", ok=True)   # 成功清零
        metrics.record_task_result("acc-1", ok=False)
        assert default_failure_monitor("acc-1")["consecutive_failures"] == 1

    def test_triggers_fuse_at_threshold(self, metrics):
        for _ in range(3):
            metrics.record_task_result("acc-1", ok=False)
        mgr = register_default_monitors(FuseManager())
        assert mgr.check_fuse("acc-1", FuseType.CONSECUTIVE_FAILURE) is True

    def test_does_not_trigger_below_threshold(self, metrics):
        metrics.record_task_result("acc-1", ok=False)
        metrics.record_task_result("acc-1", ok=False)
        mgr = register_default_monitors(FuseManager())
        assert mgr.check_fuse("acc-1", FuseType.CONSECUTIVE_FAILURE) is False


class TestDropMonitor:
    def test_zero_without_baseline(self, metrics):
        metrics.record_publish_views("acc-2", 100)
        assert default_drop_monitor("acc-2")["drop_pct"] == 0

    def test_detects_drop(self, metrics):
        # 先建立以高播放为主的 30 天基线
        for _ in range(100):
            metrics.record_publish_views("acc-2", 10000)
        # 最近 5 条暴跌
        for _ in range(5):
            metrics.record_publish_views("acc-2", 1000)
        m = default_drop_monitor("acc-2")
        assert m["drop_pct"] >= 40
        assert m["recent_views"] == 1000
        assert m["baseline_views"] > 9000

    def test_no_drop_when_stable(self, metrics):
        for _ in range(15):
            metrics.record_publish_views("acc-2", 5000)
        assert default_drop_monitor("acc-2")["drop_pct"] == 0

    def test_triggers_fuse(self, metrics):
        for _ in range(10):
            metrics.record_publish_views("acc-3", 20000)
        for _ in range(5):
            metrics.record_publish_views("acc-3", 500)
        mgr = register_default_monitors(FuseManager())
        assert mgr.check_fuse("acc-3", FuseType.ABNORMAL_DROP) is True


class TestRuleAlertMonitor:
    def test_zero_when_clean(self):
        assert default_rule_alert_monitor("acc-4")["p0_alerts"] == 0

    def test_counts_p0_alerts(self, metrics):
        metrics.record_p0_alert("acc-4", {"rule": "R1"})
        metrics.record_p0_alert("acc-4", {"rule": "R2"})
        assert default_rule_alert_monitor("acc-4")["p0_alerts"] == 2

    def test_triggers_on_any_p0(self, metrics):
        metrics.record_p0_alert("acc-4", {"rule": "R1"})
        mgr = register_default_monitors(FuseManager())
        assert mgr.check_fuse("acc-4", FuseType.RULE_ALERT_P0) is True


class TestBudgetMonitor:
    def test_zero_without_budget_config(self, metrics):
        metrics.record_cost("acc-5", 100.0)
        assert default_budget_monitor("acc-5")["budget_overflow_pct"] == 0

    def test_within_budget(self, metrics):
        metrics.set_daily_budget("acc-5", 100.0)
        metrics.record_cost("acc-5", 50.0)
        m = default_budget_monitor("acc-5")
        assert m["budget_overflow_pct"] == 50.0
        assert m["daily_budget_cny"] == 100.0

    def test_over_budget_triggers(self, metrics):
        metrics.set_daily_budget("acc-5", 100.0)
        metrics.record_cost("acc-5", 150.0)
        assert default_budget_monitor("acc-5")["budget_overflow_pct"] == 150.0
        mgr = register_default_monitors(FuseManager())
        assert mgr.check_fuse("acc-5", FuseType.BUDGET_OVERFLOW) is True


class TestPersistence:
    def test_metrics_survive_restart(self, tmp_path, monkeypatch):
        monkeypatch.setenv("NOVA_DB_PATH", str(tmp_path / "m.db"))
        Database.reset()
        reset_metrics_store()
        s1 = AccountMetricsStore()
        s1.record_task_result("acc-9", ok=False)
        s1.record_task_result("acc-9", ok=False)
        s1.set_daily_budget("acc-9", 80.0)
        Database.reset()
        reset_metrics_store()

        s2 = AccountMetricsStore()
        assert s2.consecutive_failures("acc-9") == 2
        assert s2.daily_budget("acc-9") == 80.0

    def test_fuse_cooldown_survives_restart(self, tmp_path, monkeypatch):
        """关键：熔断冷却状态必须跨重启保留，否则可被反复触发。"""
        monkeypatch.setenv("NOVA_DB_PATH", str(tmp_path / "f.db"))
        Database.reset()
        reset_metrics_store()
        from web.backend.host import fuse as fuse_mod

        fuse_mod.reset_fuse_manager()
        metrics = AccountMetricsStore()
        for _ in range(3):
            metrics.record_task_result("acc-10", ok=False)

        m1 = register_default_monitors(FuseManager(persist=True))
        assert m1.check_fuse("acc-10", FuseType.CONSECUTIVE_FAILURE) is True

        # 重启：新管理器应恢复 OPEN 状态 → 冷却期内不再触发
        m2 = register_default_monitors(FuseManager(persist=True))
        status = m2.get_fuse_status("acc-10")
        assert FuseType.CONSECUTIVE_FAILURE.value in status
        assert status[FuseType.CONSECUTIVE_FAILURE.value]["state"] == "open"
        # 冷却期内再次检查不应重复触发
        assert m2.check_fuse("acc-10", FuseType.CONSECUTIVE_FAILURE) is False
        fuse_mod.reset_fuse_manager()

    def test_account_isolation(self, metrics):
        metrics.record_task_result("acc-a", ok=False)
        metrics.record_task_result("acc-b", ok=False)
        metrics.record_task_result("acc-b", ok=False)
        assert metrics.consecutive_failures("acc-a") == 1
        assert metrics.consecutive_failures("acc-b") == 2