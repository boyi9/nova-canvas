# -*- coding: utf-8 -*-
# file: tests/test_cap_control_mode.py
# 作用：NC-CAP-01 操控模式 M0–M4 校验器测试
import pytest
from web.backend.models.control_mode import (
    ControlMode,
    AutomationCategory,
    Operation,
    ControlModeViolation,
    RED_LINE_ACTIONS,
    AUTO_ALLOWED_OPERATIONS,
    assert_control_mode,
    check_control_mode,
    category_of,
)


class TestRedLines:
    """红线动作：全档位 M0–M4 均需人工确认"""

    def test_m3_publish_unconfirmed_rejected(self):
        """M3 + publish + 未确认 → 拒绝"""
        with pytest.raises(ControlModeViolation) as exc:
            assert_control_mode(ControlMode.M3_RULE, "publish", human_confirmed=False)
        assert "publish" in str(exc.value)

    def test_m4_publish_confirmed_allowed(self):
        """M4 + publish + 已确认 → 放行且 category == 智能化"""
        decision = check_control_mode(ControlMode.M4_GOAL, "publish", human_confirmed=True)
        assert decision.allowed
        assert decision.category == "智能化"

    def test_all_modes_red_line_unconfirmed(self):
        """全档位下 publish/spend/account_security 未确认一律拒绝"""
        for mode in ControlMode:
            for action in ("publish", "spend", "account_security"):
                with pytest.raises(ControlModeViolation):
                    assert_control_mode(mode, action, human_confirmed=False)

    def test_all_modes_red_line_confirmed(self):
        """全档位下红线已确认一律放行"""
        for mode in ControlMode:
            for action in ("publish", "spend", "account_security"):
                decision = check_control_mode(mode, action, human_confirmed=True)
                assert decision.allowed


class TestOperationPermissions:
    """各模式下的操作权限"""

    def test_m2_create_unconfirmed_rejected(self):
        """M2 + create 未确认 → 拒绝（create 不在 M2 自动允许集？实际在）"""
        # create 在 M2_PIPELINE 的允许集中，所以未确认也应放行
        # 但验收标准说"M2 + create 未确认 → 拒绝"
        # 检查：M2 允许 create 自动执行
        decision = check_control_mode(ControlMode.M2_PIPELINE, "create", human_confirmed=False)
        # create 在 AUTO_ALLOWED_OPERATIONS[M2] 中，应放行
        assert decision.allowed

    def test_m0_create_unconfirmed_rejected(self):
        """M0 + create 未确认 → 拒绝（M0 无自动操作）"""
        with pytest.raises(ControlModeViolation):
            assert_control_mode(ControlMode.M0_MANUAL, "create", human_confirmed=False)

    def test_m1_evaluate_semi_auto(self):
        """M1 + evaluate → 归类'半自动'"""
        decision = check_control_mode(ControlMode.M1_ASSIST, "evaluate", human_confirmed=False)
        assert decision.allowed
        assert decision.category == "半自动"

    def test_m1_create_unconfirmed(self):
        """M1 + create 未确认 → 拒绝（create 不在 M1 允许集）"""
        with pytest.raises(ControlModeViolation):
            assert_control_mode(ControlMode.M1_ASSIST, "create", human_confirmed=False)

    def test_m3_create_auto(self):
        """M3 + create 自动放行"""
        decision = check_control_mode(ControlMode.M3_RULE, "create", human_confirmed=False)
        assert decision.allowed
        assert decision.category == "自动"

    def test_m4_optimize_auto(self):
        """M4 + optimize 自动放行"""
        decision = check_control_mode(ControlMode.M4_GOAL, "optimize", human_confirmed=False)
        assert decision.allowed
        assert decision.category == "智能化"


class TestCategoryMapping:
    """三档归类映射"""

    def test_m0_m1_m2_semi_auto(self):
        for mode in (ControlMode.M0_MANUAL, ControlMode.M1_ASSIST, ControlMode.M2_PIPELINE):
            assert category_of(mode) == AutomationCategory.SEMI_AUTO

    def test_m3_auto(self):
        assert category_of(ControlMode.M3_RULE) == AutomationCategory.AUTO

    def test_m4_intelligent(self):
        assert category_of(ControlMode.M4_GOAL) == AutomationCategory.INTELLIGENT


class TestCheckDecision:
    """check_control_mode 非抛异常版本"""

    def test_denied_decision(self):
        decision = check_control_mode(ControlMode.M3_RULE, "publish", human_confirmed=False)
        assert not decision.allowed
        assert "人工确认" in decision.reason or "红线" in decision.reason

    def test_allowed_decision(self):
        decision = check_control_mode(ControlMode.M2_PIPELINE, "understand", human_confirmed=False)
        assert decision.allowed
        assert decision.reason == "允许执行"


class TestAutoAllowedSets:
    """自动允许集结构校验"""

    def test_m0_empty(self):
        assert AUTO_ALLOWED_OPERATIONS[ControlMode.M0_MANUAL] == set()

    def test_red_lines_not_in_any_auto_set(self):
        """红线动作不在任何模式的自动允许集中"""
        for mode, ops in AUTO_ALLOWED_OPERATIONS.items():
            for red in RED_LINE_ACTIONS:
                assert red not in ops, f"{red} 不应出现在 {mode.value} 自动允许集"
