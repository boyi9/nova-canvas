# file: scripts/hybrid/build_sample_project.py
"""生成三源融合验收样例工程（manifest + 参考帧 + 素材占位）。

用法：
    python scripts/hybrid/build_sample_project.py [project_root]

默认目录：%TEMP%\\nc_project（可用 NC_PROJECT_ROOT 覆盖）。
有 ffmpeg 时会额外生成 3s 测试片段，否则仅生成结构与参考帧。
"""

import json
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import numpy as np
from PIL import Image

from backend.hybrid.models import (
    ShotManifest, Shot, ComplianceInfo, SubjectLock,
)
from backend.hybrid.shot_manifest import save

FFMPEG_AVAILABLE = bool(shutil.which("ffmpeg"))

_SHOTS = [
    # 实拍钩子（前 3 秒真人建立信任）
    dict(shot_id="S01", start_sec=0.0, duration_sec=3.0, function="hook",
         source="live_action", shot_size="CU", camera_move="static",
         compliance=ComplianceInfo(talent_release=True, bgm_license="lib/nc-001",
                                   needs_ai_label=False),
         color_ref_frame=None),
    # AI 场景空镜（环境交代）
    dict(shot_id="S02", start_sec=3.0, duration_sec=4.0, function="scene_establish",
         source="ai_generated", shot_size="LS", camera_move="slow_push_in",
         compliance=ComplianceInfo(talent_release=False, bgm_license="lib/nc-001",
                                   needs_ai_label=True),
         ai_prompt="海边清晨空镜，色温中性，光源方向与参考帧一致", seed=20260925,
         color_ref_frame="assets/ref/S01_ref.png"),
    # AI 补镜过渡
    dict(shot_id="S03", start_sec=7.0, duration_sec=2.0, function="transition_bridge",
         source="ai_pickup", shot_size="MS", camera_move="pan_left",
         compliance=ComplianceInfo(talent_release=False, bgm_license="lib/nc-001",
                                   needs_ai_label=True),
         ai_prompt="镜头匀速平移过渡，丝滑衔接", seed=20260926,
         color_ref_frame="assets/ref/S01_ref.png"),
    # 情感核心（强制实拍）
    dict(shot_id="S04", start_sec=9.0, duration_sec=3.0, function="emotional_core",
         source="live_action", shot_size="CU", camera_move="static",
         compliance=ComplianceInfo(talent_release=True, bgm_license="lib/nc-001"),
         color_ref_frame=None),
    # 产品展示（电商强制实拍本体）
    dict(shot_id="S05", start_sec=12.0, duration_sec=3.0, function="product_show",
         source="live_action", shot_size="CU", camera_move="static",
         compliance=ComplianceInfo(talent_release=True, bgm_license="lib/nc-001",
                                   product_is_real_shoot=True),
         color_ref_frame=None),
]


def _make_ref_frame(path: str) -> None:
    """生成一张偏暖的参考帧（R>B），保证锚点估算有稳定输入。"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    arr = np.zeros((360, 640, 3), dtype=np.uint8)
    arr[..., 0] = 190   # R
    arr[..., 1] = 150   # G
    arr[..., 2] = 110   # B
    Image.fromarray(arr).save(path)


def _make_clip(path: str, seconds: float = 3.0) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i",
         f"testsrc2=size=640x1136:rate=30:duration={seconds}",
         "-pix_fmt", "yuv420p", path],
        check=True, capture_output=True)


def main() -> int:
    root = sys.argv[1] if len(sys.argv) > 1 else os.environ.get(
        "NC_PROJECT_ROOT",
        os.path.join(os.environ.get("TEMP", "/tmp"), "nc_project"))
    os.makedirs(root, exist_ok=True)

    manifest = ShotManifest(
        project_id="NC_SAMPLE",
        project_type="ecommerce_short_video",
        total_duration_sec=15.0,
        fps=30,
        resolution="1080x1920",
        global_color_anchor_id="CA-SAMPLE-001",
        shots=[Shot(**s) for s in _SHOTS],
    )
    save(manifest, os.path.join(root, "manifest.json"))

    _make_ref_frame(os.path.join(root, "assets", "ref", "S01_ref.png"))

    if FFMPEG_AVAILABLE:
        _make_clip(os.path.join(root, "raw", "live", "S01.mp4"))
        _make_clip(os.path.join(root, "work", "normalized", "S02.mp4"))
    else:
        # 无 ffmpeg 时放占位文件，仅保证 audit 结构可检
        for rel in ("raw/live/S01.mp4", "work/normalized/S02.mp4"):
            p = os.path.join(root, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, "wb").close()

    print(f"sample project built: {root}")
    print(f"ffmpeg: {'yes' if FFMPEG_AVAILABLE else 'no (clips are placeholders)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())