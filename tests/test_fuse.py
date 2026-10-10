"""熔断机制测试。"""
import pytest
from datetime import datetime, timedelta
from web.backend.host.fuse import (
    FuseManager,
    FuseType,
    FuseState,
    FuseConfig,
    DEFAULT_FUSE_RULES,
    default_failure_monitor,
    default_drop_monitor,
    default_rule_alert_monitor,
    default_budget_monitor,
)


def test_fuse_config_defaults():
    """默认熔断配置验证。"""
    assert DEFAULT_FUSE_RULES[FuseType.CONSECUTIVE_FAILURE].threshold == 3
    assert DEFAULT_FUSE_RULES[FuseType.ABNORMAL_DROP].threshold == 40
    assert DEFAULT_FUSE_RULES[FuseType.RULE_ALERT_P0].threshold is None
    assert DEFAULT_FUSE_RULES[FuseType.BUDGET_OVERFLOW].threshold == 120

    for config in DEFAULT_FUSE_RULES.values():
        assert config.action == "downgrade_to_L2"


def test_consecutive_failure_fuse():
    """连续失败熔断触发。"""
    manager = FuseManager()

    def mock_monitor(account_id):
        return {"consecutive_failures": 3}

    manager.register_monitor(FuseType.CONSECUTIVE_FAILURE, mock_monitor)

    triggered = manager.check_fuse("acc_001", FuseType.CONSECUTIVE_FAILURE)
    assert triggered is True

    status = manager.get_fuse_status("acc_001")
    assert status[FuseType.CONSECUTIVE_FAILURE.value]["state"] == "open"
    assert "连续失败 3 次" in status[FuseType.CONSECUTIVE_FAILURE.value]["reason"]


def test_abnormal_drop_fuse():
    """异常掉量熔断触发。"""
    manager = FuseManager()

    def mock_monitor(account_id):
        return {"drop_pct": 50}

    manager.register_monitor(FuseType.ABNORMAL_DROP, mock_monitor)

    triggered = manager.check_fuse("acc_002", FuseType.ABNORMAL_DROP)
    assert triggered is True

    status = manager.get_fuse_status("acc_002")
    assert status[FuseType.ABNORMAL_DROP.value]["state"] == "open"
    assert "低于 30 天均值 50%" in status[FuseType.ABNORMAL_DROP.value]["reason"]


def test_rule_alert_p0_fuse():
    """P0 违规预警熔断触发。"""
    manager = FuseManager()

    def mock_monitor(account_id):
        return {"p0_alerts": 1}

    manager.register_monitor(FuseType.RULE_ALERT_P0, mock_monitor)

    triggered = manager.check_fuse("acc_003", FuseType.RULE_ALERT_P0)
    assert triggered is True

    status = manager.get_fuse_status("acc_003")
    assert status[FuseType.RULE_ALERT_P0.value]["state"] == "open"
    assert "P0 级违规风险" in status[FuseType.RULE_ALERT_P0.value]["reason"]


def test_budget_overflow_fuse():
    """预算超限熔断触发。"""
    manager = FuseManager()

    def mock_monitor(account_id):
        return {"budget_overflow_pct": 150}

    manager.register_monitor(FuseType.BUDGET_OVERFLOW, mock_monitor)

    triggered = manager.check_fuse("acc_004", FuseType.BUDGET_OVERFLOW)
    assert triggered is True

    status = manager.get_fuse_status("acc_004")
    assert status[FuseType.BUDGET_OVERFLOW.value]["state"] == "open"
    assert "超日预算 150%" in status[FuseType.BUDGET_OVERFLOW.value]["reason"]


def test_fuse_cooldown():
    """熔断冷却期内不重复触发。"""
    manager = FuseManager()

    def mock_monitor(account_id):
        return {"consecutive_failures": 3}

    manager.register_monitor(FuseType.CONSECUTIVE_FAILURE, mock_monitor)

    # 第一次触发
    manager.check_fuse("acc_cool", FuseType.CONSECUTIVE_FAILURE)

    # 立即再次检查，应因冷却期不触发
    triggered = manager.check_fuse("acc_cool", FuseType.CONSECUTIVE_FAILURE)
    assert triggered is False  # 冷却期内不重复触发


def test_fuse_status_reporting():
    """熔断状态上报。"""
    manager = FuseManager()

    def mock_monitor(account_id):
        return {"consecutive_failures": 3}

    manager.register_monitor(FuseType.CONSECUTIVE_FAILURE, mock_monitor)
    manager.check_fuse("acc_status", FuseType.CONSECUTIVE_FAILURE)

    status = manager.get_fuse_status("acc_status")
    assert status[FuseType.CONSECUTIVE_FAILURE.value]["state"] == "open"
    assert "triggered_at" in status[FuseType.CONSECUTIVE_FAILURE.value]
    assert "reason" in status[FuseType.CONSECUTIVE_FAILURE.value]


def test_try_recover_consecutive_failure():
    """连续失败熔断恢复。"""
    manager = FuseManager()

    def mock_monitor(account_id):
        return {"consecutive_failures": 3}

    manager.register_monitor(FuseType.CONSECUTIVE_FAILURE, mock_monitor)
    manager.check_fuse("acc_recover", FuseType.CONSECUTIVE_FAILURE)

    # 恢复条件：连续失败清零
    def recover_monitor(account_id):
        return {"consecutive_failures": 0}

    manager.register_monitor(FuseType.CONSECUTIVE_FAILURE, recover_monitor)
    recovered = manager.try_recover("acc_recover", FuseType.CONSECUTIVE_FAILURE)
    assert recovered is True

    status = manager.get_fuse_status("acc_recover")
    assert status[FuseType.CONSECUTIVE_FAILURE.value]["state"] == "closed"
    assert status[FuseType.CONSECUTIVE_FAILURE.value]["recovered_at"] is not None


def test_abnormal_drop_recovery():
    """异常掉量恢复：连续 3 条恢复正常。"""
    manager = FuseManager()

    def mock_monitor(account_id):
        return {"drop_pct": 50}

    manager.register_monitor(FuseType.ABNORMAL_DROP, mock_monitor)
    manager.check_fuse("acc_drop_rec", FuseType.ABNORMAL_DROP)

    # 恢复条件：连续 3 条恢复
    def recover_monitor(account_id):
        return {"consecutive_recovered": 3}

    manager.register_monitor(FuseType.ABNORMAL_DROP, recover_monitor)
    recovered = manager.try_recover("acc_drop_rec", FuseType.ABNORMAL_DROP)
    assert recovered is True

    status = manager.get_fuse_status("acc_drop_rec")
    assert status[FuseType.ABNORMAL_DROP.value]["state"] == "closed"


def test_rule_alert_recovery():
    """规则预警恢复：P0 警报清零。"""
    manager = FuseManager()

    def mock_monitor(account_id):
        return {"p0_alerts": 1}

    manager.register_monitor(FuseType.RULE_ALERT_P0, mock_monitor)
    manager.check_fuse("acc_rule_rec", FuseType.RULE_ALERT_P0)

    def recover_monitor(account_id):
        return {"p0_alerts": 0}

    manager.register_monitor(FuseType.RULE_ALERT_P0, recover_monitor)
    recovered = manager.try_recover("acc_rule_rec", FuseType.RULE_ALERT_P0)
    assert recovered is True


def test_budget_overflow_auto_recovery():
    """预算超限次日自动恢复。"""
    manager = FuseManager()

    def mock_monitor(account_id):
        return {"budget_overflow_pct": 150}

    manager.register_monitor(FuseType.BUDGET_OVERFLOW, mock_monitor)
    manager.check_fuse("acc_budget", FuseType.BUDGET_OVERFLOW)

    # 修改触发时间为昨天
    key = "acc_budget:budget_overflow"
    record = manager._fuses.get(key)
    if record:
        record.triggered_at = (datetime.now() - timedelta(days=1)).isoformat()

    recovered = manager.try_recover("acc_budget", FuseType.BUDGET_OVERFLOW)
    assert recovered is True


def test_active_fuses_list():
    """获取所有激活熔断列表。"""
    manager = FuseManager()

    def mock_monitor(account_id):
        return {"consecutive_failures": 3}

    manager.register_monitor(FuseType.CONSECUTIVE_FAILURE, mock_monitor)
    manager.check_fuse("acc_1", FuseType.CONSECUTIVE_FAILURE)
    manager.check_fuse("acc_2", FuseType.CONSECUTIVE_FAILURE)

    active = manager.get_active_fuses()
    assert len(active) == 2
    assert all(f.state == FuseState.OPEN for f in active)


def test_check_all_fuses():
    """一次性检查所有熔断类型。"""
    manager = FuseManager()

    def fail_monitor(aid): return {"consecutive_failures": 3}
    def drop_monitor(aid): return {"drop_pct": 50}
    def rule_monitor(aid): return {"p0_alerts": 1}
    def budget_monitor(aid): return {"budget_overflow_pct": 150}

    manager.register_monitor(FuseType.CONSECUTIVE_FAILURE, fail_monitor)
    manager.register_monitor(FuseType.ABNORMAL_DROP, drop_monitor)
    manager.register_monitor(FuseType.RULE_ALERT_P0, rule_monitor)
    manager.register_monitor(FuseType.BUDGET_OVERFLOW, budget_monitor)

    triggered = manager.check_all_fuses("acc_all")
    assert len(triggered) == 4
    assert FuseType.CONSECUTIVE_FAILURE in triggered
    assert FuseType.ABNORMAL_DROP in triggered
    assert FuseType.RULE_ALERT_P0 in triggered
    assert FuseType.BUDGET_OVERFLOW in triggered


def test_get_fuse_status_all():
    """获取所有熔断状态。"""
    manager = FuseManager()

    def fail_monitor(aid): return {"consecutive_failures": 3}

    manager.register_monitor(FuseType.CONSECUTIVE_FAILURE, fail_monitor)
    manager.check_fuse("acc_full", FuseType.CONSECUTIVE_FAILURE)

    status = manager.get_fuse_status("acc_full")
    assert FuseType.CONSECUTIVE_FAILURE.value in status
    assert status[FuseType.CONSECUTIVE_FAILURE.value]["state"] == "open"
    # 其他类型应为 closed
    for ft in FuseType:
        if ft != FuseType.CONSECUTIVE_FAILURE:
            assert status[ft.value]["state"] == "closed"


def test_fuse_config_defaults():
    """默认熔断配置验证。"""
    from web.backend.host.fuse import DEFAULT_FUSE_RULES, FuseType
    assert DEFAULT_FUSE_RULES[FuseType.CONSECUTIVE_FAILURE].threshold == 3
    assert DEFAULT_FUSE_RULES[FuseType.ABNORMAL_DROP].threshold == 40
    assert DEFAULT_FUSE_RULES[FuseType.RULE_ALERT_P0].threshold is None
    assert DEFAULT_FUSE_RULES[FuseType.BUDGET_OVERFLOW].threshold == 120

    for config in DEFAULT_FUSE_RULES.values():
        assert config.action == "downgrade_to_L2"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])