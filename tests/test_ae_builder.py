# -*- coding: utf-8 -*-
# file: tests/test_ae_builder.py
import pytest
import re
from web.backend.pro.generators.ae_script_builder import build_ae_script, build_aerender_cmd


def test_build_ae_script_basic():
    """基础 AE 脚本生成"""
    script = build_ae_script(
        comp_name="MAIN_9x16", width=1080, height=1920, fps=30, duration_sec=15.0,
        layers=[
            {"role": "title", "text": "秋冬新品", "in": 0.0, "out": 3.0},
            {"role": "card_data", "text": "续航 18 小时", "in": 3.0, "out": 6.0},
            {"role": "product", "in": 0.0, "out": 15.0},
            {"role": "cta", "text": "点击下方链接", "in": 13.0, "out": 15.0},
        ],
    )
    # 结构自检：必须包含命名契约、合成创建与撤销组闭合
    assert 'addComp("MAIN_9x16", 1080, 1920' in script
    assert 't.name = "TITLE_01"' in script
    assert 's.name = "PRODUCT_01"' in script
    assert script.count("beginUndoGroup") == script.count("endUndoGroup") == 1


def test_build_ae_script_escaping():
    """包含特殊字符的文本转义"""
    script = build_ae_script("TEST", 1920, 1080, 30, 5.0,
                             layers=[{"role": "title", "text": 'He said "Hello"', "in": 0, "out": 1}])
    assert 'He said \\"Hello\\"' in script


def test_unknown_role_rejected():
    """未登记角色必须报错"""
    with pytest.raises(ValueError, match="未登记的图层角色"):
        build_ae_script("X", 1920, 1080, 30, 5.0, [{"role": "unknown_role"}])


def test_build_aerender_cmd():
    """aerender 命令构造"""
    cmd = build_aerender_cmd("/t/aep/packaging.aep", "MAIN_9x16", "/out/c.mp4")
    assert 'aerender -project "/t/aep/packaging.aep"' in cmd
    assert '-comp "MAIN_9x16"' in cmd
    assert '-output "/out/c.mp4"' in cmd


def test_layer_naming_convention():
    """图层命名契约：必须严格按角色_序号命名"""
    script = build_ae_script(
        comp_name="TEST", width=1920, height=1080, fps=30, duration_sec=10.0,
        layers=[
            {"role": "title", "text": "A", "in": 0, "out": 1},
            {"role": "title", "text": "B", "in": 1, "out": 2},
            {"role": "card_data", "text": "C", "in": 0, "out": 1},
        ],
    )
    # 命名契约检查
    assert 't.name = "TITLE_01"' in script
    assert 't.name = "TITLE_02"' in script
    assert 't.name = "CARD_DATA_01"' in script


def test_invalid_role_raises():
    """未登记角色必须报错"""
    with pytest.raises(ValueError, match="未登记的图层角色"):
        build_ae_script("X", 1920, 1080, 30, 5.0, [{"role": "unknown_role"}])


if __name__ == "__main__":
    pytest.main([__file__, "-v"])