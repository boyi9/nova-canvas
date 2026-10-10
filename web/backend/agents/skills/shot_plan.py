"""拍摄任务卡生成 Skill：Director Agent 产出分镜后自动生成 ShotCard 并下发接缝任务。"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from web.backend.agents.skills.base import BaseSkill, SkillInput, SkillOutput
from web.backend.host.shot_card import build_shot_card, generate_shot_cards_from_manifest
from web.backend.host.handoff_bus import get_bus
from web.backend.host.handoff_models import HandoffType


class ShotPlanSkill(BaseSkill):
    name = "shot_plan"
    description = "根据分镜中 source=live 的镜头，自动生成拍摄任务卡并创建 SHOOT 接缝任务"

    async def execute(self, inp: SkillInput) -> SkillOutput:
        # 从参数获取 Shot Manifest
        manifest = inp.params.get("shot_manifest")
        if not manifest:
            return SkillOutput(
                new_nodes=[],
                new_edges=[],
                message="缺少 shot_manifest 参数",
                files=[],
            )

        device = inp.params.get("device", "generic_2026_flagship")
        project_id = inp.params.get("project_id", manifest.get("project_id", "PRJ"))

        # 生成所有 source=live 镜头的任务卡
        shot_cards = generate_shot_cards_from_manifest(manifest, device)

        new_nodes = []
        new_edges = []
        handoff_tasks = []

        bus = get_bus()

        for i, card in enumerate(shot_cards):
            # 创建拍摄任务卡节点
            node_id = f"shoot_card_{card.shot_id}"
            new_nodes.append({
                "id": node_id,
                "type": "shoot_card",
                "data": card.to_dict(),
                "position": {"x": 100 + i * 300, "y": 200},
            })

            # 创建 SHOOT 接缝任务
            task_id = f"shoot_{project_id}_{card.shot_id}"
            handoff_task = bus.create(
                task_id=task_id,
                htype=HandoffType.SHOOT,
                project_id=project_id,
                title=f"拍摄任务：{card.shot_id} ({card.shot_size})",
                payload={
                    "shot_id": card.shot_id,
                    "shot_card": card.to_dict(),
                    "device": device,
                },
            )
            handoff_tasks.append(handoff_task.to_dict())

        return SkillOutput(
            new_nodes=new_nodes,
            new_edges=new_edges,
            message=f"已生成 {len(shot_cards)} 张拍摄任务卡，创建 {len(handoff_tasks)} 个 SHOOT 接缝任务",
            files=[{"type": "shot_cards", "count": len(shot_cards)}],
        )


if __name__ == "__main__":
    # 简单测试
    skill = ShotPlanSkill()
    print(f"Skill: {skill.name}")
    print(f"Description: {skill.description}")