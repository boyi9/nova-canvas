# -*- coding: utf-8 -*-
# file: tests/test_skills_base.py
# 作用：P1-2 Agent Skill 基类契约
import pytest

from web.backend.agents.skills.base import (
    BaseSkill,
    SkillInput,
    SkillOutput,
    all_skills,
    clear_skills,
    get_skill,
    register_skill,
)


class EchoSkill(BaseSkill):
    name = "echo"
    description = "回显参数"

    async def execute(self, inp: SkillInput) -> SkillOutput:
        return SkillOutput(
            new_nodes=[{"id": "n1", "type": "echo"}],
            new_edges=[],
            message=str(inp.params.get("msg", "")),
            files=[],
        )


def test_skill_input_defaults():
    inp = SkillInput()
    assert inp.params == {}
    assert inp.context == {}


def test_skill_output_roundtrip():
    out = SkillOutput(new_nodes=[{"id": "a"}], new_edges=[], message="ok", files=[1])
    d = out.to_dict()
    assert d["message"] == "ok"
    assert d["new_nodes"] == [{"id": "a"}]


def test_register_and_get_skill():
    clear_skills()
    skill = register_skill(EchoSkill())
    assert get_skill("echo") is skill
    assert "echo" in all_skills()
    assert skill.describe() == {"name": "echo", "description": "回显参数"}
    clear_skills()
    assert get_skill("echo") is None


def test_register_requires_name():
    class NoName(BaseSkill):
        async def execute(self, inp: SkillInput) -> SkillOutput:
            return SkillOutput()

    with pytest.raises(ValueError):
        register_skill(NoName())


@pytest.mark.asyncio
async def test_skill_execute_async():
    skill = EchoSkill()
    out = await skill.execute(SkillInput(params={"msg": "你好"}))
    assert out.message == "你好"
    assert out.new_nodes[0]["type"] == "echo"
