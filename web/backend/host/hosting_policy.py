"""托管分级配置与红线断言：配置错误则服务拒绝启动。"""
from __future__ import annotations

from typing import Dict, Any, Set


AUTONOMY_LEVELS = {
    "L0": {"name": "全人工", "human_actions_per_day": None, "auto_publish": False},
    "L1": {"name": "AI辅助", "human_actions_per_day": 20, "auto_publish": False},
    "L2": {"name": "半自动", "human_actions_per_day": 8, "auto_publish": False},
    "L3": {"name": "全托管单账号", "human_actions_per_day": 2, "auto_publish": False},
    "L4": {"name": "矩阵无人值守", "human_actions_per_day": 1, "auto_publish": True},
}
DEFAULT_LEVEL = "L2"

RED_LINES: Set[str] = {"publish", "spend", "account_security"}

# 允许自动执行的动作白名单（红线动作永不在此）
AUTO_EXECUTABLE_ACTIONS: Set[str] = {
    "shot_card.generate",
    "clip.qc",
    "rough_cut.build",
    "fine_cut.build",
    "package.build",
    "bgm.match",
    "compliance.precheck",
    "handoff.dispatch",
    "draft.export",
    "data.pull",
    "report.generate",
    "generate_script",
    "queue_render",
    "validate_script",
    "collect_render",
    "validate_exr",
    "build_version",
}

SAFETY_DEFAULTS = {
    "publish_interval_min": 30,
    "publish_interval_max": 120,
    "publish_jitter_min": 25,
    "daily_publish_cap": 5,
    "new_account_protection_days": 7,
}

FUSE_RULES = {
    "consecutive_failure": {"threshold": 3, "action": "downgrade_to_L2"},
    "abnormal_drop": {"threshold_pct": 40, "action": "downgrade_to_L2"},
    "rule_alert_p0": {"action": "downgrade_to_L2"},
    "budget_overflow_pct": {"threshold": 120, "action": "downgrade_to_L2"},
}


class StartupCheckError(RuntimeError):
    """启动检查失败异常。"""
    pass


def assert_policy(cfg: Dict[str, Any]) -> None:
    """
    启动期断言：把红线动作配成自动执行，直接拒绝启动。

    Args:
        cfg: 托管配置字典，包含 level, auto_actions, safety, auto_publish 等

    Raises:
        StartupCheckError: 配置违规时抛出，服务拒绝启动
    """
    level = cfg.get("level", DEFAULT_LEVEL)
    if level not in AUTONOMY_LEVELS:
        raise StartupCheckError(f"unknown autonomy level: {level}")

    # 红线动作永不允许自动执行
    for act in cfg.get("auto_actions", []):
        if act in RED_LINES:
            raise StartupCheckError(
                f"red-line action '{act}' must never be auto-executable"
            )
        if act not in AUTO_EXECUTABLE_ACTIONS:
            raise StartupCheckError(f"action '{act}' not in auto-executable whitelist")

    # 安全默认值不得被改到更危险的值
    safety_cfg = {**SAFETY_DEFAULTS, **cfg.get("safety", {})}

    if safety_cfg["publish_interval_min"] < 30 or safety_cfg["publish_interval_max"] > 120:
        raise StartupCheckError("publish interval must stay within 30-120 min")

    if safety_cfg["daily_publish_cap"] > 5 and level != "L4":
        raise StartupCheckError("daily_publish_cap > 5 requires L4")

    if safety_cfg["new_account_protection_days"] < 7:
        raise StartupCheckError("new-account protection cannot be shorter than 7 days")

    # 非 L4 不允许自动发布
    if cfg.get("auto_publish") and level != "L4":
        raise StartupCheckError("auto_publish only allowed at L4")

    # L4 要求额外条件
    if level == "L4":
        required = cfg.get("l4_requirements", {})
        if not required.get("dedicated_device_ip"):
            raise StartupCheckError("L4 requires dedicated_device_ip: true")
        if not required.get("sla_signed"):
            raise StartupCheckError("L4 requires sla_signed: true")
        if not required.get("human_audit_enabled"):
            raise StartupCheckError("L4 requires human_audit_enabled: true")


def check_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    仅检查配置，不抛出异常，返回检查结果（用于 --check-config 命令）。

    Returns:
        {"valid": bool, "errors": List[str], "warnings": List[str]}
    """
    errors = []
    warnings = []

    level = cfg.get("level", DEFAULT_LEVEL)
    if level not in AUTONOMY_LEVELS:
        errors.append(f"unknown autonomy level: {level}")

    for act in cfg.get("auto_actions", []):
        if act in RED_LINES:
            errors.append(f"red-line action '{act}' must never be auto-executable")
        if act not in AUTO_EXECUTABLE_ACTIONS:
            errors.append(f"action '{act}' not in auto-executable whitelist")

    safety_cfg = {**SAFETY_DEFAULTS, **cfg.get("safety", {})}

    if safety_cfg["publish_interval_min"] < 30 or safety_cfg["publish_interval_max"] > 120:
        errors.append("publish interval must stay within 30-120 min")

    if safety_cfg["daily_publish_cap"] > 5 and level != "L4":
        errors.append("daily_publish_cap > 5 requires L4")

    if safety_cfg["new_account_protection_days"] < 7:
        errors.append("new-account protection cannot be shorter than 7 days")

    if cfg.get("auto_publish") and level != "L4":
        errors.append("auto_publish only allowed at L4")

    if level == "L4":
        required = cfg.get("l4_requirements", {})
        if not required.get("dedicated_device_ip"):
            errors.append("L4 requires dedicated_device_ip: true")
        if not required.get("sla_signed"):
            errors.append("L4 requires sla_signed: true")
        if not required.get("human_audit_enabled"):
            errors.append("L4 requires human_audit_enabled: true")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }


def get_autonomy_level_info(level: str) -> Dict[str, Any]:
    """获取自主级别信息。"""
    return AUTONOMY_LEVELS.get(level, AUTONOMY_LEVELS[DEFAULT_LEVEL])


def is_auto_executable(action: str) -> bool:
    """判断动作是否在自动执行白名单中。"""
    return action in AUTO_EXECUTABLE_ACTIONS


def is_red_line(action: str) -> bool:
    """判断动作是否为红线动作。"""
    return action in RED_LINES


if __name__ == "__main__":
    # 自测
    print("=== 测试合法配置 ===")
    good_cfg = {
        "level": "L2",
        "auto_actions": ["shot_card.generate", "clip.qc", "rough_cut.build"],
        "safety": {"publish_interval_min": 45, "daily_publish_cap": 3},
        "auto_publish": False,
    }
    try:
        assert_policy(good_cfg)
        print("✅ 合法配置通过")
    except StartupCheckError as e:
        print(f"❌ 意外报错: {e}")

    print("\n=== 测试红线动作拦截 ===")
    bad_cfg = {
        "level": "L2",
        "auto_actions": ["publish", "clip.qc"],
    }
    try:
        assert_policy(bad_cfg)
        print("❌ 应该拦截但未拦截")
    except StartupCheckError as e:
        print(f"✅ 正确拦截: {e}")

    print("\n=== 测试 L2 非法自动发布 ===")
    bad_cfg2 = {
        "level": "L2",
        "auto_publish": True,
    }
    try:
        assert_policy(bad_cfg2)
        print("❌ 应该拦截但未拦截")
    except StartupCheckError as e:
        print(f"✅ 正确拦截: {e}")

    print("\n=== 测试 L4 合法自动发布 ===")
    good_l4 = {
        "level": "L4",
        "auto_publish": True,
        "l4_requirements": {
            "dedicated_device_ip": True,
            "sla_signed": True,
            "human_audit_enabled": True,
        },
    }
    try:
        assert_policy(good_l4)
        print("✅ L4 合法配置通过")
    except StartupCheckError as e:
        print(f"❌ 意外报错: {e}")

    print("\n=== 测试安全默认值被改危险 ===")
    bad_safety = {
        "level": "L2",
        "safety": {"publish_interval_min": 5},
    }
    try:
        assert_policy(bad_safety)
        print("❌ 应该拦截但未拦截")
    except StartupCheckError as e:
        print(f"✅ 正确拦截: {e}")

    print("\n=== check_config 演示 ===")
    result = check_config(good_cfg)
    print(f"合法配置: {result}")
    result = check_config(bad_cfg)
    print(f"红线配置: {result}")