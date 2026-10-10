"""接缝任务控制 Skill：处理接缝任务的下发/接收/校验/续跑。"""
from __future__ import annotations

from typing import Any, Dict, Optional

from web.backend.agents.skills.base import BaseSkill, SkillInput, SkillOutput
from web.backend.host.handoff_bus import get_bus
from web.backend.host.handoff_models import HandoffType, HandoffState


class HandoffControlSkill(BaseSkill):
    name = "handoff_ctl"
    description = "接缝任务全生命周期控制：创建/下发/接单/回传/校验/续跑"

    async def execute(self, inp: SkillInput) -> SkillOutput:
        action = inp.params.get("action")
        if not action:
            return SkillOutput(
                new_nodes=[],
                new_edges=[],
                message="缺少 action 参数",
                files=[],
            )

        bus = get_bus()

        if action == "create":
            return await self._create_task(bus, inp)
        elif action == "dispatch":
            return await self._dispatch_task(bus, inp)
        elif action == "accept":
            return await self._accept_task(bus, inp)
        elif action == "submit":
            return await self._submit_task(bus, inp)
        elif action == "validate":
            return await self._validate_task(bus, inp)
        elif action == "resume":
            return await self._resume_task(bus, inp)
        elif action == "check_timeout":
            return await self._check_timeout(bus, inp)
        else:
            return SkillOutput(
                new_nodes=[],
                new_edges=[],
                message=f"未知 action: {action}",
                files=[],
            )

    async def _create_task(self, bus, inp: SkillInput) -> SkillOutput:
        htype_str = inp.params.get("htype")
        if not htype_str:
            return SkillOutput(new_nodes=[], new_edges=[], message="缺少 htype", files=[])

        from web.backend.host.handoff_models import HandoffType
        htype = HandoffType(htype_str)

        task = bus.create(
            task_id=inp.params["task_id"],
            htype=htype,
            project_id=inp.params["project_id"],
            title=inp.params["title"],
            payload=inp.params.get("payload"),
            assignee=inp.params.get("assignee", ""),
        )
        return SkillOutput(
            new_nodes=[],
            new_edges=[],
            message=f"接缝任务已创建: {task.task_id}",
            files=[{"type": "handoff_task", "content": task.to_dict()}],
        )

    async def _dispatch_task(self, bus, inp: SkillInput) -> SkillOutput:
        task = bus.get(inp.params["task_id"])
        if not task:
            return SkillOutput(new_nodes=[], new_edges=[], message="任务不存在", files=[])
        bus.dispatch(inp.params["task_id"], inp.params.get("assignee", ""))
        return SkillOutput(
            new_nodes=[],
            new_edges=[],
            message="任务已下发",
            files=[{"type": "handoff_task", "content": task.to_dict()}],
        )

    async def _accept_task(self, bus, inp: SkillInput) -> SkillOutput:
        task = bus.get(inp.params["task_id"])
        if not task:
            return SkillOutput(new_nodes=[], new_edges=[], message="任务不存在", files=[])
        bus.accept(inp.params["task_id"], inp.params["actor"])
        return SkillOutput(
            new_nodes=[],
            new_edges=[],
            message="任务已接单",
            files=[{"type": "handoff_task", "content": task.to_dict()}],
        )

    async def _submit_task(self, bus, inp: SkillInput) -> SkillOutput:
        task = bus.get(inp.params["task_id"])
        if not task:
            return SkillOutput(new_nodes=[], new_edges=[], message="任务不存在", files=[])
        bus.submit(inp.params["task_id"], inp.params["payload"], inp.params["actor"])
        return SkillOutput(
            new_nodes=[],
            new_edges=[],
            message="回传已提交",
            files=[{"type": "handoff_task", "content": task.to_dict()}],
        )

    async def _validate_task(self, bus, inp: SkillInput) -> SkillOutput:
        task = bus.get(inp.params["task_id"])
        if not task:
            return SkillOutput(new_nodes=[], new_edges=[], message="任务不存在", files=[])

        # 校验器：检查 payload 是否包含所需交付物
        required = {
            "shoot": ["video_clip"],
            "authorize": ["signed_release"],
            "supply": ["asset_file"],
            "review": ["approved"],
            "final_approve": ["confirm_publish"],
        }

        htype = task.htype.value if hasattr(task.htype, "value") else str(task.htype)
        required_fields = required.get(htype, [])

        def validator(t):
            for field in required_fields:
                if field not in t.payload:
                    return False, f"missing deliverable: {field}"
            return True, "all deliverables present"

        bus.validate(inp.params["task_id"], validator, inp.params.get("actor", "system"))
        return SkillOutput(
            new_nodes=[],
            new_edges=[],
            message=f"校验完成，状态: {task.state.value}",
            files=[{"type": "handoff_task", "content": task.to_dict()}],
        )

    async def _resume_task(self, bus, inp: SkillInput) -> SkillOutput:
        task = bus.get(inp.params["task_id"])
        if not task:
            return SkillOutput(new_nodes=[], new_edges=[], message="任务不存在", files=[])

        def downstream(t):
            t._log("auto_resume", "skill_triggered")

        bus.resume(inp.params["task_id"], downstream)
        return SkillOutput(
            new_nodes=[],
            new_edges=[],
            message="已自动续跑下游",
            files=[{"type": "handoff_task", "content": task.to_dict()}],
        )

    async def _check_timeout(self, bus, inp: SkillInput) -> SkillOutput:
        results = bus.check_timeouts()
        return SkillOutput(
            new_nodes=[],
            new_edges=[],
            message=f"超时检查完成: {results}",
            files=[{"type": "timeout_check", "content": results}],
        )


if __name__ == "__main__":
    skill = HandoffControlSkill()
    print(f"Skill: {skill.name}")
    print(f"Description: {skill.description}")