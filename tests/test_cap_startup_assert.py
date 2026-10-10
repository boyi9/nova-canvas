# -*- coding: utf-8 -*-
# file: tests/test_cap_startup_assert.py
# 作用：NC-CAP-09 红线纳入操控校验 + 启动期断言测试
import pytest
from web.backend.models.control_mode import (
    ControlMode,
    RED_LINE_ACTIONS,
    AUTO_ALLOWED_OPERATIONS,
    StartupAssertionError,
    startup_assert_control_config,
    startup_assert_from_catalog_config,
)


class TestStartupAssertion:
    """启动期断言：配置错误在启动时暴露"""

    def test_publish_in_auto_actions_rejected(self):
        """把 publish 塞进自动动作 → 启动失败并给出明确原因"""
        cfg = {
            "control_mode": "M2",
            "auto_actions": ["publish", "draft.export"],
        }
        with pytest.raises(StartupAssertionError) as exc:
            startup_assert_control_config(cfg)
        assert "publish" in str(exc.value)
        assert "红线" in str(exc.value)

    def test_spend_in_auto_actions_rejected(self):
        cfg = {"control_mode": "M2", "auto_actions": ["spend"]}
        with pytest.raises(StartupAssertionError):
            startup_assert_control_config(cfg)

    def test_account_security_in_auto_actions_rejected(self):
        cfg = {"control_mode": "M2", "auto_actions": ["account_security"]}
        with pytest.raises(StartupAssertionError):
            startup_assert_control_config(cfg)

    def test_valid_config_passes(self):
        """合法配置通过"""
        cfg = {
            "control_mode": "M2",
            "auto_actions": ["draft.export", "data.pull"],
        }
        startup_assert_control_config(cfg)  # 不应抛异常

    def test_invalid_control_mode_rejected(self):
        """非法 control_mode → 启动失败"""
        cfg = {"control_mode": "L2", "auto_actions": []}
        with pytest.raises(StartupAssertionError) as exc:
            startup_assert_control_config(cfg)
        assert "control_mode" in str(exc.value)

    def test_auto_publish_m4_only(self):
        """M4 + auto_publish=True 通过"""
        cfg = {
            "control_mode": "M4",
            "auto_publish": True,
            "m4_requirements": {
                "human_audit_enabled": True,
                "goal_review_passed": True,
            },
        }
        startup_assert_control_config(cfg)  # 不应抛异常

    def test_auto_publish_m2_rejected(self):
        """M2 + auto_publish=True 被拒绝"""
        cfg = {
            "control_mode": "M2",
            "auto_publish": True,
        }
        with pytest.raises(StartupAssertionError) as exc:
            startup_assert_control_config(cfg)
        assert "auto_publish" in str(exc.value)
        assert "M4" in str(exc.value)

    def test_m4_requires_human_audit(self):
        """M4 缺 human_audit → 启动失败"""
        cfg = {
            "control_mode": "M4",
            "m4_requirements": {
                "human_audit_enabled": False,
                "goal_review_passed": True,
            },
        }
        with pytest.raises(StartupAssertionError):
            startup_assert_control_config(cfg)

    def test_m4_requires_goal_review(self):
        """M4 缺 goal_review → 启动失败"""
        cfg = {
            "control_mode": "M4",
            "m4_requirements": {
                "human_audit_enabled": True,
                "goal_review_passed": False,
            },
        }
        with pytest.raises(StartupAssertionError):
            startup_assert_control_config(cfg)


class TestCatalogStartupAssert:
    """从目录配置的启动断言"""

    def test_red_lines_not_in_auto_sets(self):
        """内部断言：红线不在任何自动允许集"""
        cfg = {"control_mode": "M2"}
        startup_assert_from_catalog_config(cfg)  # 不应抛异常

    def test_valid_catalog_config(self):
        cfg = {
            "control_mode": "M2",
            "auto_actions": ["draft.export"],
        }
        startup_assert_from_catalog_config(cfg)

    def test_invalid_catalog_config(self):
        cfg = {
            "control_mode": "M2",
            "auto_actions": ["publish"],
        }
        with pytest.raises(StartupAssertionError):
            startup_assert_from_catalog_config(cfg)


class TestRedLineIntegrity:
    """红线完整性：全档位红线不自动执行"""

    def test_red_lines_never_in_auto_sets(self):
        """所有模式的自动允许集都不含红线"""
        for mode in ControlMode:
            allowed = AUTO_ALLOWED_OPERATIONS.get(mode, set())
            for red in RED_LINE_ACTIONS:
                assert red not in allowed, (
                    f"红线 '{red}' 不应出现在 {mode.value} 的自动允许集"
                )
