# -*- coding: utf-8 -*-
# file: tests/test_maya_builder.py
import pytest
from web.backend.pro.generators.maya_scene_builder import (
    build_ma_ascii, build_py_script, validate_maya_version,
    build_maya_render_cmd, MAYA_VERSION_MATRIX, build_maya_scene
)


def test_build_ma_ascii():
    """MA ASCII 场景生成"""
    ma = build_ma_ascii("sh010", "v003")
    assert "renderCam" in ma
    assert "arnoldDriver" in ma
    assert "polyCube" in ma
    assert "polySphere" in ma
    assert "setAttr" in ma


def test_py_script_generation():
    """Python 脚本生成"""
    py = build_py_script("sh010", "v003", "2026")
    assert "maya.cmds" in py
    assert "renderCam" in py
    assert "keyLight" in py
    assert "arnoldDriver" in py


def test_version_validation():
    """版本校验"""
    # 支持版本
    assert validate_maya_version("2026")
    assert validate_maya_version("2025")
    # 遗留版本
    assert validate_maya_version("2022")
    assert validate_maya_version("2020")
    assert validate_maya_version("2018")
    # 不支持版本
    assert not validate_maya_version("2015")
    assert not validate_maya_version("2010")


def test_maya_render_cmd():
    """Maya 渲染命令构造"""
    cmd = build_maya_render_cmd("/scene/sh010.ma", 1001, 1100)
    assert 'mayabatch -batch -render' in cmd
    assert '-s 1001' in cmd
    assert '-e 1100' in cmd
    assert 'sh010.ma' in cmd


def test_version_matrix():
    """版本矩阵配置检查"""
    assert "2026" in MAYA_VERSION_MATRIX["supported"]
    assert "2025" in MAYA_VERSION_MATRIX["supported"]
    assert "2018" in MAYA_VERSION_MATRIX["legacy_best_effort"]
    assert "copycat" in MAYA_VERSION_MATRIX["plugin_gate"]


def test_unsupported_version_raises():
    """不支持版本抛错"""
    with pytest.raises(ValueError, match="不在支持范围内"):
        build_maya_scene("sh010", "v001", 1920, 1080, "2015")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])