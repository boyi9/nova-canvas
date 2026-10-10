"""托管策略红线断言测试。"""
import pytest
from web.backend.host.hosting_policy import (
    assert_policy,
    check_config,
    StartupCheckError,
    RED_LINES,
    AUTO_EXECUTABLE_ACTIONS,
    DEFAULT_LEVEL,
)


def test_valid_config():
    """合法配置通过。"""
    cfg = {
        "level": "L2",
        "auto_actions": ["shot_card.generate", "clip.qc", "rough_cut.build"],
        "safety": {"publish_interval_min": 45, "daily_publish_cap": 3},
        "auto_publish": False,
    }
    assert_policy(cfg)  # 不应抛出异常


def test_red_line_action_blocked():
    """红线动作被拦截。"""
    for red_line in RED_LINES:
        cfg = {
            "level": "L2",
            "auto_actions": [red_line, "clip.qc"],
        }
        with pytest.raises(StartupCheckError, match=f"red-line action '{red_line}'"):
            assert_policy(cfg)


def test_unknown_action_blocked():
    """未在白名单中的动作被拦截。"""
    cfg = {
        "level": "L2",
        "auto_actions": ["unknown_action"],
    }
    with pytest.raises(StartupCheckError, match="not in auto-executable whitelist"):
        assert_policy(cfg)


def test_l2_auto_publish_blocked():
    """L2 级别不允许自动发布。"""
    cfg = {
        "level": "L2",
        "auto_publish": True,
    }
    with pytest.raises(StartupCheckError, match="auto_publish only allowed at L4"):
        assert_policy(cfg)


def test_l4_auto_publish_allowed():
    """L4 级别允许自动发布（需满足条件）。"""
    cfg = {
        "level": "L4",
        "auto_publish": True,
        "l4_requirements": {
            "dedicated_device_ip": True,
            "sla_signed": True,
            "human_audit_enabled": True,
        },
    }
    assert_policy(cfg)  # 应通过


def test_l4_missing_requirements():
    """L4 缺少必要条件被拦截。"""
    cfg = {
        "level": "L4",
        "auto_publish": True,
        "l4_requirements": {
            "dedicated_device_ip": True,
            "sla_signed": False,  # 缺少
        },
    }
    with pytest.raises(StartupCheckError, match="L4 requires sla_signed: true"):
        assert_policy(cfg)


def test_publish_interval_bounds():
    """发布间隔必须在 30-120 分钟。"""
    # 太小
    cfg = {
        "level": "L2",
        "safety": {"publish_interval_min": 10},
    }
    with pytest.raises(StartupCheckError, match="publish interval must stay within 30-120 min"):
        assert_policy(cfg)

    # 太大
    cfg = {
        "level": "L2",
        "safety": {"publish_interval_max": 200},
    }
    with pytest.raises(StartupCheckError, match="publish interval must stay within 30-120 min"):
        assert_policy(cfg)

    # 合法
    cfg = {
        "level": "L2",
        "safety": {"publish_interval_min": 40, "publish_interval_max": 100},
    }
    assert_policy(cfg)  # 通过


def test_daily_publish_cap_l4_only():
    """日更上限 >5 仅限 L4。"""
    cfg = {
        "level": "L2",
        "safety": {"daily_publish_cap": 10},
    }
    with pytest.raises(StartupCheckError, match="daily_publish_cap > 5 requires L4"):
        assert_policy(cfg)

    # L4 允许
    cfg = {
        "level": "L4",
        "safety": {"daily_publish_cap": 10},
        "l4_requirements": {
            "dedicated_device_ip": True,
            "sla_signed": True,
            "human_audit_enabled": True,
        },
    }
    assert_policy(cfg)


def test_new_account_protection_minimum():
    """新号保护期不得短于 7 天。"""
    cfg = {
        "level": "L2",
        "safety": {"new_account_protection_days": 3},
    }
    with pytest.raises(StartupCheckError, match="new-account protection cannot be shorter than 7 days"):
        assert_policy(cfg)


def test_unknown_level():
    """未知级别被拦截。"""
    cfg = {
        "level": "L99",
    }
    with pytest.raises(StartupCheckError, match="unknown autonomy level"):
        assert_policy(cfg)


def test_check_config_valid():
    """check_config 返回 valid=True。"""
    cfg = {
        "level": "L2",
        "auto_actions": ["shot_card.generate"],
        "safety": {"publish_interval_min": 40},
    }
    result = check_config(cfg)
    assert result["valid"] is True
    assert len(result["errors"]) == 0


def test_check_config_invalid():
    """check_config 返回错误列表。"""
    cfg = {
        "level": "L2",
        "auto_actions": ["publish"],
        "auto_publish": True,
        "safety": {"publish_interval_min": 5},
    }
    result = check_config(cfg)
    assert result["valid"] is False
    assert len(result["errors"]) >= 3  # 红线动作、自动发布、间隔过短


def test_red_lines_constant():
    """RED_LINES 包含三条红线。"""
    assert RED_LINES == {"publish", "spend", "account_security"}


def test_auto_executable_actions_whitelist():
    """白名单包含预期动作"""
    expected = {
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
    assert AUTO_EXECUTABLE_ACTIONS == expected


def test_default_level():
    """默认级别为 L2。"""
    assert DEFAULT_LEVEL == "L2"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])