"""素材质检 Skill：线下素材回传后自动质检，不合格打回接缝任务。"""
from __future__ import annotations

from typing import Any, Dict, List

from web.backend.agents.skills.base import BaseSkill, SkillInput, SkillOutput
from web.backend.host.clip_qc import qc_clip, qc_batch, verdict_to_handoff_action
from web.backend.host.handoff_bus import get_bus
from web.backend.host.handoff_models import HandoffState


class ClipQCSkill(BaseSkill):
    name = "clip_qc"
    description = "对回传素材执行 8 项自动质检，根据结果更新接缝任务状态"

    async def execute(self, inp: SkillInput) -> SkillOutput:
        # 获取待检素材元数据列表
        clips_meta = inp.params.get("clips", [])
        if not clips_meta:
            return SkillOutput(
                new_nodes=[],
                new_edges=[],
                message="缺少 clips 参数",
                files=[],
            )

        baseline = inp.params.get("baseline", {})
        task_id = inp.params.get("handoff_task_id")  # 关联的接缝任务

        results = qc_batch(clips_meta, baseline)

        # 汇总结果
        all_pass = all(r.verdict == "pass" for r in results)
        any_reject = any(r.verdict == "reject" for r in results)

        # 如果有关联的接缝任务，更新其状态
        if task_id:
            bus = get_bus()
            task = bus.get(task_id)
            if task:
                if any_reject:
                    # 有 reject 直接打回
                    task.state = HandoffState.REJECTED
                    task._log("qc_rejected", f"{sum(1 for r in results if r.verdict == 'reject')} 个素材不合格")
                elif all_pass:
                    # 全 pass 校验通过
                    task.state = HandoffState.VALIDATED
                    task._log("qc_passed", "所有素材质检通过")
                else:
                    # 有 warn 但无 reject
                    task.state = HandoffState.VALIDATED
                    task._log("qc_passed_with_warning", f"{sum(1 for r in results if r.verdict == 'warn')} 个素材有警告")

        # 生成报告文件
        report = {
            "total": len(results),
            "pass": sum(1 for r in results if r.verdict == "pass"),
            "warn": sum(1 for r in results if r.verdict == "warn"),
            "reject": sum(1 for r in results if r.verdict == "reject"),
            "details": [
                {
                    "clip_index": i,
                    "verdict": r.verdict,
                    "score": r.score,
                    "issues": r.issues,
                    "suggestions": r.suggestions,
                }
                for i, r in enumerate(results)
            ],
        }

        return SkillOutput(
            new_nodes=[],
            new_edges=[],
            message=f"质检完成：{report['pass']} 通过 / {report['warn']} 警告 / {report['reject']} 拒收",
            files=[{"type": "qc_report", "content": report}],
        )


if __name__ == "__main__":
    skill = ClipQCSkill()
    print(f"Skill: {skill.name}")
    print(f"Description: {skill.description}")