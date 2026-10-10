# -*- coding: utf-8 -*-
# file: backend/agents/skills/base.py
# 作用：Agent Skill 统一契约（输入 / 输出 / 基类 / 注册表）
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class SkillInput:
    """Skill 输入：params 为调用方参数，context 为运行上下文。"""

    params: Dict[str, Any] = field(default_factory=dict)
    context: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SkillOutput:
    """Skill 输出：新增画布节点/边 + 消息 + 产物。"""

    new_nodes: List[Dict[str, Any]] = field(default_factory=list)
    new_edges: List[Dict[str, Any]] = field(default_factory=list)
    message: str = ""
    files: List[Any] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "new_nodes": self.new_nodes,
            "new_edges": self.new_edges,
            "message": self.message,
            "files": self.files,
        }


class BaseSkill(ABC):
    """Agent Skill 基类：异步 execute + 静态元数据（name/description）。"""

    name: str = "base"
    description: str = ""

    @abstractmethod
    async def execute(self, inp: SkillInput) -> SkillOutput:
        ...

    def describe(self) -> Dict[str, str]:
        return {"name": self.name, "description": self.description}


_SKILLS: Dict[str, BaseSkill] = {}


def register_skill(skill: BaseSkill) -> BaseSkill:
    if not skill.name or skill.name == "base":
        raise ValueError("Skill 必须声明有效的 name")
    _SKILLS[skill.name] = skill
    return skill


def get_skill(name: str) -> Optional[BaseSkill]:
    return _SKILLS.get(name)


def all_skills() -> Dict[str, BaseSkill]:
    return dict(_SKILLS)


def clear_skills() -> None:
    _SKILLS.clear()
