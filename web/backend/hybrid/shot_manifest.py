"""Shot Manifest 的构建、校验与持久化。

Shot Manifest 是整条混合制作流水线的 Single Source of Truth。
每一条规则都对应产品设计文档第 13.4 节的严格约束。
"""

import json
import os
from dataclasses import asdict
from typing import List

from backend.hybrid.models import (
    ShotManifest, Shot, AI_SOURCES, EMOTIONAL_CORE_ALLOWED,
    LightingInfo, ComplianceInfo, SubjectLock,
)


class ManifestValidationError(ValueError):
    """校验失败时抛出，消息为中文，便于前端弹窗展示。"""
    pass


def validate(manifest: ShotManifest) -> List[str]:
    """对 ShotManifest 进行完整性校验，返回问题清单；空列表表示通过。

    校验规则共 8 条（文档 13.4 中均有对应说明）：
    1. shot_id 全局唯一
    2. 情感核心镜头必须为 live_action
    3. AI 来源必须带 ai_prompt 与 seed
    4. AI 来源必须声明 needs_ai_label
    5. 实拍来源必须确认 talent_release
    6. 电商项目 product_show 必须 product_is_real_shoot
    7. AI 片段必须有 color_ref_frame
    8. 时长总和与声明一致（容差 0.5s）
    9. 镜头时间轴不重叠
    """
    problems: List[str] = []

    ids = [s.shot_id for s in manifest.shots]
    if len(ids) != len(set(ids)):
        problems.append("shot_id 存在重复")

    for s in manifest.shots:
        # ── 规则 1：情感核心镜头只允许实拍 ──────────────
        if s.function == "emotional_core" and s.source not in EMOTIONAL_CORE_ALLOWED:
            problems.append(
                f"{s.shot_id}: 情感核心镜头必须实拍（live_action），"
                f"当前为 {s.source}——AI 无法承载真实情绪，会跳戏"
            )
        # ── 规则 2：AI 来源必须带 ai_prompt 与 seed ────────
        if s.source in AI_SOURCES and not s.ai_prompt:
            problems.append(f"{s.shot_id}: AI 来源缺少 ai_prompt")
        if s.source in AI_SOURCES and s.seed is None:
            problems.append(f"{s.shot_id}: AI 来源缺少 seed（无法复现与色调校准）")
        # ── 规则 3：AI 来源必须声明需要标识 ───────────────
        if s.source in AI_SOURCES and not s.compliance.needs_ai_label:
            problems.append(f"{s.shot_id}: AI 来源必须设置 needs_ai_label=True")
        # ── 规则 4：实拍来源必须确认肖像授权 ───────────────
        if s.source == "live_action" and not s.compliance.talent_release:
            problems.append(f"{s.shot_id}: 实拍素材缺少肖像授权确认")
        # ── 规则 5：电商项目商品展示镜头必须实拍商品本体 ─────
        if (manifest.project_type == "ecommerce_short_video"
                and s.function == "product_show"
                and not s.compliance.product_is_real_shoot):
            problems.append(f"{s.shot_id}: 电商项目商品展示镜头必须实拍商品本体")
        # ── 规则 6：AI 片段必须有色彩参考帧 ────────────────
        if s.source in AI_SOURCES and not s.color_ref_frame:
            problems.append(f"{s.shot_id}: AI 片段缺少 color_ref_frame，无法做色彩锚定")

    # ── 规则 7：时长总和与声明一致（容差 0.5s；total_duration_sec=0 视为未声明） ────
    total = sum(s.duration_sec for s in manifest.shots)
    if manifest.total_duration_sec > 0 and abs(total - manifest.total_duration_sec) > 0.5:
        problems.append(
            f"镜头时长总和 {total:.2f}s 与 total_duration_sec "
            f"{manifest.total_duration_sec:.2f}s 不一致（容差 0.5s）"
        )

    # ── 规则 8：镜头时间轴不重叠 ────────────────────────
    ordered = sorted(manifest.shots, key=lambda s: s.start_sec)
    for prev, cur in zip(ordered, ordered[1:]):
        if prev.start_sec + prev.duration_sec > cur.start_sec + 1e-6:
            problems.append(f"{prev.shot_id} 与 {cur.shot_id} 时间轴重叠")

    return problems


def save(manifest: ShotManifest, path: str) -> str:
    """写入 JSON 文件，校验未通过则抛出 ManifestValidationError。"""
    problems = validate(manifest)
    if problems:
        raise ManifestValidationError("; ".join(problems))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(asdict(manifest), f, ensure_ascii=False, indent=2)
    return path


def load(path: str) -> ShotManifest:
    """从 JSON 文件加载并恢复 ShotManifest 对象。

    注意：load() 内部会重构 LightingInfo、ComplianceInfo 与 SubjectLock
    三个 dataclass，确保反序列化后结构完整。
    """
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    shots = []
    for s in raw.get("shots", []):
        s = dict(s)
        # 三个嵌套 dataclass 的反序列化入口
        s["lighting"] = LightingInfo(**s.get("lighting", {}))
        s["compliance"] = ComplianceInfo(**s.get("compliance", {}))
        if s.get("subject_lock"):
            s["subject_lock"] = SubjectLock(**s["subject_lock"])
        shots.append(Shot(**s))
    raw["shots"] = shots
    return ShotManifest(**raw)


def source_summary(manifest: ShotManifest) -> dict:
    """统计各来源占比，用于 13.12 混制配方的合规性检查。"""
    total = sum(s.duration_sec for s in manifest.shots) or 1.0
    agg: dict = {}
    for s in manifest.shots:
        agg[s.source] = agg.get(s.source, 0.0) + s.duration_sec
    return {k: round(v / total * 100, 1) for k, v in agg.items()}