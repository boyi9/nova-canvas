"""三源混剪编排（NC-HYB-07）：把实拍/AI生成/AI补镜片段按 Shot Manifest 写入剪映工程。

主文档 13.10；执行方案批 4。
每个片段保留来源标记（名前缀 + 色标 + meta），支持逐段替换。
"""

import os

from backend.generators.jianying_generator import JianyingDraftBuilder

# 来源色标（用于剪映片段颜色标记；若 API 不支持则降级为片段名前缀）
SOURCE_COLOR = {
    "live_action": "#00B894",       # 实拍 - 绿
    "ai_generated": "#0984E3",      # AI生成 - 蓝
    "ai_pickup": "#FDCB6E",         # AI补镜 - 黄
    "hybrid_composite": "#A29BFE",  # 虚实合成 - 紫
    "stock": "#B2BEC3",             # 素材库 - 灰
}

SOURCE_TAG = {
    "live_action": "[实拍]",
    "ai_generated": "[AI]",
    "ai_pickup": "[AI补镜]",
    "hybrid_composite": "[合成]",
    "stock": "[素材]",
}


def resolve_asset(shot: dict, work_dir: str) -> str:
    """解析片段实际路径：实拍走 raw/live，素材库走 raw/stock，其余走 work/graded。"""
    if shot["source"] == "live_action":
        return os.path.join(work_dir, "raw", "live", f"{shot['shot_id']}.mp4")
    if shot["source"] == "stock":
        return os.path.join(work_dir, "raw", "stock", f"{shot['shot_id']}.mp4")
    return os.path.join(work_dir, "graded", f"{shot['shot_id']}_graded.mp4")


def build_hybrid_draft(manifest: dict, work_dir: str, out_dir: str,
                       bgm_path: str = None, voice_path: str = None) -> str:
    """构建混制剪映草稿：视频轨 + 配音轨 + BGM 轨。

    - 片段名带 [实拍]/[AI]/[AI补镜] 等来源前缀；
    - 每段 set_meta("source", ...)，供后续"只重做这一段"。
    """
    builder = JianyingDraftBuilder(
        draft_name=manifest["project_id"],
        width=int(manifest["resolution"].split("x")[0]),
        height=int(manifest["resolution"].split("x")[1]),
        fps=manifest["fps"],
    )

    video_track = builder.add_track("video", "主视频")
    for shot in sorted(manifest["shots"], key=lambda s: s["start_sec"]):
        asset = resolve_asset(shot, work_dir)
        seg = video_track.add_segment(
            asset_path=asset,
            start=shot["start_sec"],
            duration=shot["duration_sec"],
            name=f"{SOURCE_TAG[shot['source']]}{shot['shot_id']}",
            color=SOURCE_COLOR[shot["source"]],
            meta={"source": shot["source"], "function": shot["function"]},
        )
        # 逐段保留来源元数据，支持后续"只重做这一段"
        seg.set_meta("source", shot["source"])

    if voice_path:
        builder.add_audio("voice", voice_path)
    if bgm_path:
        builder.add_audio("bgm", bgm_path, volume=0.35)

    return builder.save(out_dir)