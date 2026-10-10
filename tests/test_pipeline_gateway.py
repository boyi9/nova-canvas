# -*- coding: utf-8 -*-
# file: tests/test_pipeline_gateway.py
# 测试管线能力网关
import pytest
from web.backend.pro.pipeline_gateway import (
    PipelineJob, DCC, Route, REDLINE_ACTIONS, AUTO_ACTIONS,
    StartupCheckError
)
from web.backend.host.hosting_policy import assert_policy, check_config


def test_valid_pipeline_job():
    """合法作业通过策略检查"""
    job = PipelineJob(
        job_id="J001",
        dcc=DCC.NUKE,
        route=Route.HOST_SCRIPT,
        shot_id="sh010",
        template="basic_comp",
        actions=["generate_script", "queue_render"],
        license_ok=True,
        color_config="aces_2.0_studio",
    )
    plan = job.plan()
    assert plan["dcc"] == "nuke"
    assert plan["engine_file"] == "sh010_v001.nk"
    assert plan["render_cli"] == "Nuke -x -F"


def test_redline_action_blocked():
    """红线动作被拦截"""
    for red_line in REDLINE_ACTIONS:
        job = PipelineJob(
            job_id="J001",
            dcc=DCC.AE,
            route=Route.HOST_SCRIPT,
            shot_id="sh010",
            actions=[red_line, "generate_script"],
            license_ok=True,
            color_config="aces_2.0",
        )
        with pytest.raises(PermissionError, match=f"红线动作禁止进入自动管线: {red_line}"):
            job.plan()


def test_unknown_action_blocked():
    """未登记动作被拦截"""
    job = PipelineJob(
        job_id="J001",
        dcc=DCC.AE,
        route=Route.HOST_SCRIPT,
        shot_id="sh010",
        actions=["unknown_action"],
        license_ok=True,
        color_config="aces_2.0",
    )
    with pytest.raises(ValueError, match="未知动作，需先登记到 AUTO_ACTIONS"):
        job.plan()


def test_license_required():
    """未声明授权被拦截"""
    job = PipelineJob(
        job_id="J001",
        dcc=DCC.NUKE,
        route=Route.HOST_SCRIPT,
        shot_id="sh010",
        actions=["generate_script"],
        license_ok=False,
        color_config="aces_2.0",
    )
    with pytest.raises(PermissionError, match="未声明合法软件授权"):
        job.plan()


def test_color_config_required():
    """缺少色彩配置被拦截"""
    job = PipelineJob(
        job_id="J001",
        dcc=DCC.NUKE,
        route=Route.HOST_SCRIPT,
        shot_id="sh010",
        actions=["generate_script"],
        license_ok=True,
        color_config="",
    )
    with pytest.raises(PermissionError, match="缺少色彩管理声明"):
        job.plan()


def test_unknown_action_rejected():
    """未登记动作被拒绝"""
    job = PipelineJob(
        job_id="J001",
        dcc=DCC.AE,
        route=Route.HOST_SCRIPT,
        shot_id="sh010",
        actions=["unknown_action"],
        license_ok=True,
        color_config="aces_2.0",
    )
    with pytest.raises(ValueError, match="未知动作，需先登记到 AUTO_ACTIONS"):
        job.plan()


def test_check_config_valid():
    """check_config 合法配置返回 valid=True"""
    cfg = {
        "level": "L2",
        "auto_actions": ["generate_script", "queue_render"],
        "safety": {"publish_interval_min": 45},
        "auto_publish": False,
    }
    result = check_config(cfg)
    assert result["valid"] is True
    assert len(result["errors"]) == 0


def test_check_config_invalid():
    """check_config 返回错误列表"""
    cfg = {
        "level": "L2",
        "auto_actions": ["publish"],
        "auto_publish": True,
        "safety": {"publish_interval_min": 5},
    }
    result = check_config(cfg)
    assert result["valid"] is False
    assert len(result["errors"]) >= 3


def test_red_lines_constant():
    """RED_LINES 包含四条红线"""
    assert REDLINE_ACTIONS == {"publish", "spend_money", "account_security", "final_approve"}


def test_auto_executable_actions_whitelist():
    """白名单包含预期动作"""
    expected = {
        "generate_script", "validate_script", "queue_render",
        "collect_render", "validate_exr", "build_version",
    }
    assert AUTO_ACTIONS == expected


if __name__ == "__main__":
    pytest.main([__file__, "-v"])