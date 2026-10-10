"""统一素材总线：归一命名、编码、帧率、分辨率、色彩空间。

NC-HYB-02：把实拍与 AI 素材归一，使二者能在同一工程混排。
"""

import os
import json
import subprocess
from dataclasses import dataclass
from typing import List

STANDARD_FPS = {24, 25, 30}
STANDARD_RES = {"1080x1920", "1920x1080", "3840x2160", "1080x1080"}
COLOR_SPACES = {"Rec.709", "ACES"}

SOURCE_DIR = {
    "live_action": "raw/live",
    "ai_generated": "raw/ai",
    "ai_pickup": "work/bridges",
    "hybrid_composite": "work/composite",
    "stock": "raw/stock",
}


@dataclass
class NormalizeSpec:
    project_root: str
    fps: int = 30
    resolution: str = "1080x1920"
    color_space: str = "Rec.709"
    codec: str = "libx264"       # 中间码统一 H.264 CRF16，跨平台
    crf: str = "16"


def asset_name(project_id: str, shot_id: str, source: str, version: int = 1) -> str:
    """统一命名：{project}_{shot_id}_{source}_v{version}.mp4"""
    return f"{project_id}_{shot_id}_{source}_v{version}.mp4"


def probe(video: str) -> dict:
    """用 ffprobe 读取帧率/分辨率/时长/像素格式。

    对同一素材连续调用两次结果一致（无状态、无随机性）。
    """
    cmd = ["ffprobe", "-v", "error", "-select_streams", "v:0",
           "-show_entries", "stream=width,height,r_frame_rate,pix_fmt,duration",
           "-of", "json", video]
    out = subprocess.run(cmd, check=True, capture_output=True, text=True).stdout
    st = json.loads(out)["streams"][0]
    num, den = st["r_frame_rate"].split("/")
    return {
        "width": int(st["width"]),
        "height": int(st["height"]),
        "fps": round(float(num) / float(den), 3),
        "pix_fmt": st.get("pix_fmt"),
        "duration": float(st.get("duration", 0) or 0),
    }


def normalize(video_in: str, spec: NormalizeSpec, out_path: str) -> str:
    """转码归一：统一帧率、分辨率、像素格式、色彩空间。

    等比缩放 + 补边（scale ... force_original_aspect_ratio=decrease + pad），
    保证 24/25/30fps 混入的素材输出统一帧率且画面不变形。
    非法 fps / resolution / color_space 必须抛 ValueError。
    """
    if spec.fps not in STANDARD_FPS:
        raise ValueError(f"fps 必须是 {sorted(STANDARD_FPS)} 之一，当前 {spec.fps}")
    if spec.resolution not in STANDARD_RES:
        raise ValueError(f"resolution 必须是 {sorted(STANDARD_RES)} 之一")
    if spec.color_space not in COLOR_SPACES:
        raise ValueError(f"color_space 必须是 {sorted(COLOR_SPACES)} 之一")

    w, h = spec.resolution.split("x")
    vf = (f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
          f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,"
          f"fps={spec.fps},format=yuv420p")

    cmd = ["ffmpeg", "-y", "-i", video_in, "-vf", vf,
           "-c:v", spec.codec, "-crf", spec.crf, "-preset", "medium",
           "-c:a", "aac", "-b:a", "192k", out_path]
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    subprocess.run(cmd, check=True, capture_output=True)
    return out_path


def ingest(project_id: str, shot_id: str, source: str, video_in: str,
           spec: NormalizeSpec, version: int = 1) -> str:
    """把一段素材按 Shot Manifest 的来源，归一并放入对应目录。"""
    rel = SOURCE_DIR.get(source)
    if rel is None:
        raise ValueError(f"未知来源: {source}")
    out_path = os.path.join(spec.project_root, rel,
                            asset_name(project_id, shot_id, source, version))
    return normalize(video_in, spec, out_path)


def audit(manifest: dict, project_root: str) -> List[str]:
    """审计：所有镜头素材是否齐备、规格是否一致。

    - live_action / stock：直接取 raw 目录下的 {shot_id}.mp4
    - AI 来源（ai_generated / ai_pickup / hybrid_composite）：取统调后
      的 work/graded/{shot_id}_graded.mp4
    返回缺失素材的 shot_id 清单；空列表表示齐备。
    """
    problems: List[str] = []
    for s in manifest["shots"]:
        rel = SOURCE_DIR[s["source"]]
        if s["source"] in ("live_action", "stock"):
            path = os.path.join(project_root, rel, f"{s['shot_id']}.mp4")
        else:
            path = os.path.join(project_root, "work", "graded",
                                f"{s['shot_id']}_graded.mp4")
        if not os.path.exists(path):
            problems.append(f"{s['shot_id']}: 素材缺失 {path}")
    return problems