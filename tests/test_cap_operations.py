# -*- coding: utf-8 -*-
# file: tests/test_cap_operations.py
# 作用：NC-CAP-02 七类操作注册表测试
import pytest
from web.backend.models.operations import (
    Operation,
    OPERATION_CAPS,
    SkillSpec,
    SkillRegistry,
)


class TestOperationEnum:
    """七类操作可枚举"""

    def test_seven_operations(self):
        ops = list(Operation)
        assert len(ops) == 7
        values = {o.value for o in ops}
        assert values == {"create", "optimize", "adjust", "repair", "add", "understand", "evaluate"}

    def test_operation_caps_coverage(self):
        """每个操作都有 capabilities 声明"""
        for op in Operation:
            assert op in OPERATION_CAPS
            assert len(OPERATION_CAPS[op]) > 0


class TestSkillSpec:
    """Skill 规格校验"""

    def test_valid_spec(self):
        spec = SkillSpec(
            skill_id="image_creator",
            operation=Operation.CREATE,
            capabilities=["image_gen", "vision"],
        )
        assert spec.validate() == []

    def test_missing_capabilities(self):
        """未声明 capabilities → 报错"""
        spec = SkillSpec(
            skill_id="bad_skill",
            operation=Operation.CREATE,
            capabilities=[],
        )
        errors = spec.validate()
        assert len(errors) > 0
        assert "未声明 capabilities" in errors[0]

    def test_missing_required_cap(self):
        """缺少所需 capability → 报错"""
        spec = SkillSpec(
            skill_id="partial_skill",
            operation=Operation.CREATE,
            capabilities=["vision"],  # 缺 image_gen
        )
        errors = spec.validate()
        assert len(errors) > 0
        assert "image_gen" in errors[0]


class TestSkillRegistry:
    """Skill 注册表：注册期即校验"""

    def setUp(self):
        self.registry = SkillRegistry()

    def test_register_valid(self):
        reg = SkillRegistry()
        spec = SkillSpec(
            skill_id="s1",
            operation=Operation.CREATE,
            capabilities=["image_gen"],
        )
        reg.register(spec)
        assert reg.get("s1") is spec

    def test_register_invalid_raises(self):
        """注册未声明 capabilities 的 Skill → ValueError"""
        reg = SkillRegistry()
        spec = SkillSpec(
            skill_id="bad",
            operation=Operation.CREATE,
            capabilities=[],
        )
        with pytest.raises(ValueError):
            reg.register(spec)

    def test_register_missing_required_cap_raises(self):
        """注册缺所需 capability 的 Skill → ValueError"""
        reg = SkillRegistry()
        spec = SkillSpec(
            skill_id="partial",
            operation=Operation.REPAIR,
            capabilities=["image_gen"],  # 缺 inpaint
        )
        with pytest.raises(ValueError):
            reg.register(spec)

    def test_by_operation(self):
        reg = SkillRegistry()
        reg.register(SkillSpec("c1", Operation.CREATE, ["image_gen"]))
        reg.register(SkillSpec("c2", Operation.CREATE, ["image_gen", "vision"]))
        reg.register(SkillSpec("r1", Operation.REPAIR, ["inpaint"]))
        assert len(reg.by_operation(Operation.CREATE)) == 2
        assert len(reg.by_operation(Operation.REPAIR)) == 1

    def test_find_by_caps(self):
        reg = SkillRegistry()
        reg.register(SkillSpec("full", Operation.REPAIR, ["inpaint", "layer_split", "image_edit"]))
        reg.register(SkillSpec("partial", Operation.REPAIR, ["inpaint"]))
        # 需要 inpaint + layer_split
        results = reg.find_by_caps(["inpaint", "layer_split"])
        assert len(results) == 1
        assert results[0].skill_id == "full"

    def test_get_unregistered(self):
        reg = SkillRegistry()
        with pytest.raises(KeyError):
            reg.get("nonexistent")
