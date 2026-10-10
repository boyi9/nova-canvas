# -*- coding: utf-8 -*-
# file: tests/test_nk_builder.py
import pytest
from web.backend.pro.generators.nk_builder import build_nk, build_nuke_cli, WORKFLOW_TEMPLATES


def test_build_nk_basic():
    """基础 NK 脚本生成"""
    nk = build_nk("sh010", "v003", 1920, 1080, template="basic_comp")
    assert "Read {" in nk
    assert "Write {" in nk
    assert "sh010_v003_beauty_%04d.exr" in nk          # 读取输入
    assert "sh010_v003_comp_%04d.exr" in nk            # 写出结果
    assert nk.count("{") == nk.count("}"), "花括号未闭合"


def test_build_nk_templates():
    """所有模板均可生成"""
    for template in WORKFLOW_TEMPLATES:
        nk = build_nk("sh001", "v001", 1920, 1080, template=template)
        assert "Root {" in nk
        assert "Write {" in nk


def test_unknown_template_rejected():
    """未登记模板报错"""
    with pytest.raises(ValueError, match="未登记模板"):
        build_nk("sh001", "v001", 1920, 1080, template="not_exist")


def test_build_nuke_cli():
    """Nuke 无头渲染命令构造"""
    cmd = build_nuke_cli("/comp/sc_010.nk", 1001, 1100)
    assert 'Nuke -x -F 1001-1100' in cmd
    assert 'sc_010.nk' in cmd


def test_nk_syntax_valid():
    """生成的 NK 语法自检：花括号闭合、节点名唯一"""
    nk = build_nk("sh010", "v003", 1920, 1080, template="basic_comp")
    assert nk.count("{") == nk.count("}")
    # 简单检查：每个节点只出现一次
    nodes = ["Read", "OCIOColorSpace", "Grade", "Merge2", "Write"]
    for node in nodes:
        count = nk.count(node)
        assert count >= 1, f"节点 {node} 缺失或重复"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])