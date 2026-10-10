# -*- coding: utf-8 -*-
# file: backend/models/operations.py
# 作用：NC-CAP-02 七类操作注册表
from enum import Enum
from dataclasses import dataclass, field
from typing import Dict, List, Set


class Operation(str, Enum):
    """七类操作谱系"""
    CREATE = "create"       # 创作
    OPTIMIZE = "optimize"   # 优化
    ADJUST = "adjust"       # 调整
    REPAIR = "repair"       # 修复
    ADD = "add"             # 新增
    UNDERSTAND = "understand"  # 理解
    EVALUATE = "evaluate"   # 评估


# 每类操作所需的能力标签（用于硬约束过滤）
OPERATION_CAPS: Dict[Operation, List[str]] = {
    Operation.CREATE: ["image_gen"],
    Operation.OPTIMIZE: ["upscale"],
    Operation.ADJUST: ["image_edit"],
    Operation.REPAIR: ["inpaint"],
    Operation.ADD: ["image_edit"],
    Operation.UNDERSTAND: ["vision"],
    Operation.EVALUATE: ["vision"],
}


@dataclass
class SkillSpec:
    """Skill 注册规格"""
    skill_id: str
    operation: Operation
    capabilities: List[str] = field(default_factory=list)
    description: str = ""

    def validate(self) -> List[str]:
        """校验：capabilities 非空且覆盖 operation 所需"""
        errors = []
        if not self.capabilities:
            errors.append(f"Skill '{self.skill_id}' 未声明 capabilities")
            return errors
        required = OPERATION_CAPS.get(self.operation, [])
        missing = [c for c in required if c not in self.capabilities]
        if missing:
            errors.append(
                f"Skill '{self.skill_id}' 缺少所需 capabilities: {missing}"
            )
        return errors


class SkillRegistry:
    """Skill 注册表：注册期即校验，不允许带病上线"""

    def __init__(self):
        self._skills: Dict[str, SkillSpec] = {}

    def register(self, spec: SkillSpec) -> None:
        """注册 Skill；校验失败则抛 ValueError"""
        errors = spec.validate()
        if errors:
            raise ValueError("; ".join(errors))
        self._skills[spec.skill_id] = spec

    def get(self, skill_id: str) -> SkillSpec:
        if skill_id not in self._skills:
            raise KeyError(f"Skill '{skill_id}' 未注册")
        return self._skills[skill_id]

    def all(self) -> Dict[str, SkillSpec]:
        return dict(self._skills)

    def by_operation(self, op: Operation) -> List[SkillSpec]:
        return [s for s in self._skills.values() if s.operation == op]

    def find_by_caps(self, required_caps: List[str]) -> List[SkillSpec]:
        """找出满足所需 capabilities 的所有 Skill"""
        req = set(required_caps)
        return [
            s for s in self._skills.values()
            if req.issubset(set(s.capabilities))
        ]
