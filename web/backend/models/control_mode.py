# -*- coding: utf-8 -*-
# file: backend/models/control_mode.py
# 作用：NC-CAP-01 操控模式 M0–M4 校验器（合并四套旧 L 分级）
from enum import Enum
from dataclasses import dataclass
from typing import Optional


class ControlMode(str, Enum):
    """操控模式：手动 → 辅助 → 流水线 → 规则触发 → 目标驱动"""
    M0_MANUAL = "M0"           # 手动：全人工
    M1_ASSIST = "M1"           # 辅助：AI 建议 + 人确认
    M2_PIPELINE = "M2"         # 流水线：自动执行 + 人把关（默认）
    M3_RULE = "M3"             # 规则触发：条件满足自动执行
    M4_GOAL = "M4"             # 目标驱动：AI 规划 + 自纠错


class AutomationCategory(str, Enum):
    """三档归类"""
    SEMI_AUTO = "半自动"       # M1–M2
    AUTO = "自动"              # M3
    INTELLIGENT = "智能化"     # M4


class Operation(str, Enum):
    """七类操作"""
    CREATE = "create"
    OPTIMIZE = "optimize"
    ADJUST = "adjust"
    REPAIR = "repair"
    ADD = "add"
    UNDERSTAND = "understand"
    EVALUATE = "evaluate"


# 红线动作：全档位 M0–M4 均需人工确认
RED_LINE_ACTIONS = {"publish", "spend", "account_security"}

# 各模式下可自动执行的操作（不含红线）
AUTO_ALLOWED_OPERATIONS = {
    ControlMode.M0_MANUAL: set(),  # 无自动操作
    ControlMode.M1_ASSIST: {Operation.UNDERSTAND, Operation.EVALUATE},
    ControlMode.M2_PIPELINE: {
        Operation.UNDERSTAND, Operation.EVALUATE,
        Operation.CREATE, Operation.OPTIMIZE, Operation.ADJUST,
        Operation.REPAIR, Operation.ADD,
    },
    ControlMode.M3_RULE: {
        Operation.UNDERSTAND, Operation.EVALUATE,
        Operation.CREATE, Operation.OPTIMIZE, Operation.ADJUST,
        Operation.REPAIR, Operation.ADD,
    },
    ControlMode.M4_GOAL: {
        Operation.UNDERSTAND, Operation.EVALUATE,
        Operation.CREATE, Operation.OPTIMIZE, Operation.ADJUST,
        Operation.REPAIR, Operation.ADD,
    },
}

# 模式 → 三档归类
_MODE_CATEGORY = {
    ControlMode.M0_MANUAL: AutomationCategory.SEMI_AUTO,
    ControlMode.M1_ASSIST: AutomationCategory.SEMI_AUTO,
    ControlMode.M2_PIPELINE: AutomationCategory.SEMI_AUTO,
    ControlMode.M3_RULE: AutomationCategory.AUTO,
    ControlMode.M4_GOAL: AutomationCategory.INTELLIGENT,
}


class ControlModeViolation(Exception):
    """操控模式违规异常"""
    def __init__(self, message: str, mode: str = "", operation: str = ""):
        super().__init__(message)
        self.mode = mode
        self.operation = operation
        self.message = message


def category_of(mode: ControlMode) -> AutomationCategory:
    """返回模式对应的三档归类"""
    return _MODE_CATEGORY[mode]


def is_red_line(operation: str) -> bool:
    """判断是否红线动作"""
    return operation in RED_LINE_ACTIONS


def assert_control_mode(
    mode: ControlMode,
    operation: str,
    human_confirmed: bool = False,
) -> None:
    """
    执行前断言：不通过则抛 ControlModeViolation。
    规则：
      1. 红线动作（publish/spend/account_security）在任何档位均需 human_confirmed=True
      2. 非红线动作按 AUTO_ALLOWED_OPERATIONS 判断是否可自动执行
    """
    # 规则1：红线全档位强制确认
    if is_red_line(operation) and not human_confirmed:
        raise ControlModeViolation(
            f"红线动作 '{operation}' 在 {mode.value} 档位下需人工确认后方可执行",
            mode=mode.value,
            operation=operation,
        )

    # 规则2：非红线动作按模式允许集判断
    allowed = AUTO_ALLOWED_OPERATIONS.get(mode, set())
    # operation 可能是 str 或 Enum，统一转 str 比较
    op_value = operation.value if isinstance(operation, Operation) else operation
    allowed_values = {o.value if isinstance(o, Operation) else o for o in allowed}

    if op_value not in allowed_values:
        # 不在自动允许集 → 需人工确认
        if not human_confirmed:
            raise ControlModeViolation(
                f"操作 '{op_value}' 在 {mode.value} 档位下不允许自动执行，需人工确认",
                mode=mode.value,
                operation=op_value,
            )


@dataclass
class ControlDecision:
    """控制决策结果"""
    allowed: bool
    mode: str
    operation: str
    category: str
    reason: str = ""


def check_control_mode(
    mode: ControlMode,
    operation: str,
    human_confirmed: bool = False,
) -> ControlDecision:
    """非抛异常版本：返回决策对象"""
    try:
        assert_control_mode(mode, operation, human_confirmed)
        cat = category_of(mode)
        return ControlDecision(
            allowed=True,
            mode=mode.value,
            operation=operation,
            category=cat.value,
            reason="允许执行",
        )
    except ControlModeViolation as e:
        cat = category_of(mode)
        return ControlDecision(
            allowed=False,
            mode=mode.value,
            operation=operation,
            category=cat.value,
            reason=e.message,
        )


# ==================== NC-CAP-09 启动期断言 ====================

class StartupAssertionError(RuntimeError):
    """启动期配置断言失败"""
    pass


def startup_assert_control_config(cfg: dict) -> None:
    """
    NC-CAP-09 启动期断言：配置错误在启动时暴露，而不是运行到一半。

    检查项：
    1. 红线动作（publish/spend/account_security）不得被配成 auto_executable: true
    2. control_mode 必须是合法的 M0-M4
    3. auto_publish 只允许在 M4（目标驱动）档位

    Raises:
        StartupAssertionError: 配置违规时抛出，服务拒绝启动
    """
    errors: list = []

    # 1. 红线动作不得自动执行
    auto_actions = cfg.get("auto_actions", cfg.get("auto_executable_actions", []))
    for act in auto_actions:
        if act in RED_LINE_ACTIONS:
            errors.append(
                f"红线动作 '{act}' 被配置为自动执行，必须拒绝启动。"
                f"红线动作（publish/spend/account_security）在任何档位均需人工确认。"
            )

    # 2. control_mode 合法性
    mode_str = cfg.get("control_mode", "M2")
    valid_modes = {m.value for m in ControlMode}
    if mode_str not in valid_modes:
        errors.append(
            f"control_mode '{mode_str}' 非法，必须是 {sorted(valid_modes)} 之一"
        )

    # 3. auto_publish 只允许 M4
    if cfg.get("auto_publish", False):
        if mode_str != ControlMode.M4_GOAL.value:
            errors.append(
                f"auto_publish=true 仅允许在 M4（目标驱动）档位，"
                f"当前为 {mode_str}，拒绝启动"
            )

    # 4. M4 模式额外要求
    if mode_str == ControlMode.M4_GOAL.value:
        m4_req = cfg.get("m4_requirements", {})
        if not m4_req.get("human_audit_enabled", False):
            errors.append("M4 模式要求 human_audit_enabled: true")
        if not m4_req.get("goal_review_passed", False):
            errors.append("M4 模式要求 goal_review_passed: true")

    if errors:
        raise StartupAssertionError(
            "控制模式启动断言失败，服务拒绝启动:\n" + "\n".join(errors)
        )


def startup_assert_from_catalog_config(cfg: dict) -> None:
    """
    从模型能力目录配置进行启动断言。
    若 catalog 加载失败，此处也应失败。
    """
    # 调用基础断言
    startup_assert_control_config(cfg)

    # 额外检查：确认红线在所有模式的自动允许集中都不存在
    for mode in ControlMode:
        allowed = AUTO_ALLOWED_OPERATIONS.get(mode, set())
        for red in RED_LINE_ACTIONS:
            if red in allowed:
                raise StartupAssertionError(
                    f"内部错误：红线动作 '{red}' 不应出现在 {mode.value} 自动允许集中"
                )
