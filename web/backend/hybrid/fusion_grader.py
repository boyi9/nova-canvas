"""虚实合成与统一调色（NC-HYB-06）：把 AI 片段拉齐到实拍基准。

主文档 13.9；执行方案批 4。四步调色法：
  ① 色彩克隆  lut3d 应用锚点 LUT
  ② HSL 微差  eq 微调亮度/对比度/饱和度
  ③ 蒙版局部过渡 blend + 遮罩（P1 增强）
  ④ 关键帧稳运动 deshake
"""

import os
import subprocess

from backend.hybrid.color_anchor import (
    ColorAnchor, probe_video_stats, write_cube_lut,
)

GRADE_PRESET = {
    "crf": "16",
    "preset": "medium",
    "pix_fmt": "yuv420p",
}

# ΔE00 验收阈值（13.14）：一般场景 ≤3，人像场景放宽 ≤5
DELTA_E_LIMIT = 3.0
DELTA_E_PORTRAIT_LIMIT = 5.0

# 亮度补偿保守系数（防止过曝）
BRIGHTNESS_COMPENSATION = 0.25


def grade_shot_to_anchor(shot_in: str, anchor: ColorAnchor, shot_out: str,
                         lut_dir: str = "/tmp/nc_lut", deshake: bool = True) -> str:
    """单片段调色：LUT 统一 + 亮度补偿 + 稳运动。

    输出：H.264 CRF16 + yuv420p（10s/1080p 目标 ≤40s）。
    """
    os.makedirs(lut_dir, exist_ok=True)
    lut_path = os.path.join(lut_dir, f"{anchor.anchor_id}.cube")

    st = probe_video_stats(shot_in, at_sec=1.0)
    write_cube_lut(anchor, lut_path, sat_current=st["saturation"], strength=1.0)

    # 亮度差补偿：把片段平均亮度拉向锚点亮度（保守系数 0.25，避免过曝）
    delta_b = (anchor.brightness - st["brightness"]) * BRIGHTNESS_COMPENSATION

    chain = [f"lut3d='{lut_path}'",
             f"eq=brightness={delta_b:.4f}:contrast=1.02:saturation=1.0"]
    if deshake:
        chain.append("deshake")
    vf = ",".join(chain)

    cmd = ["ffmpeg", "-y", "-i", shot_in, "-vf", vf,
           "-c:v", "libx264", "-crf", GRADE_PRESET["crf"],
           "-preset", GRADE_PRESET["preset"],
           "-pix_fmt", GRADE_PRESET["pix_fmt"], "-an", shot_out]
    os.makedirs(os.path.dirname(shot_out) or ".", exist_ok=True)
    subprocess.run(cmd, check=True, capture_output=True)
    return shot_out


def grade_manifest(manifest: dict, anchor: ColorAnchor, work_dir: str) -> list:
    """按 Shot Manifest 批量调色所有非实拍片段（实拍作为基准，不调）。"""
    graded = []
    for shot in manifest["shots"]:
        if shot["source"] == "live_action":
            continue
        src = os.path.join(work_dir, "normalized", f"{shot['shot_id']}.mp4")
        dst = os.path.join(work_dir, "graded", f"{shot['shot_id']}_graded.mp4")
        graded.append(grade_shot_to_anchor(src, anchor, dst))
    return graded


def measure_delta_e(shot_a: str, shot_b: str) -> float:
    """粗略评估两片段色差（Demo 用均值欧氏距离近似 ΔE00）。

    MVP 阶段用颜色空间均值差近似；P1 接入 colour-science 库做真实 ΔE00。
    验收阈值：<=3.0（人像场景 <=5.0）。
    """
    import numpy as np
    from PIL import Image

    def _lab_mean(video: str) -> "np.ndarray":
        tmp = f"/tmp/nc_de_{abs(hash(video))}.png"
        subprocess.run(["ffmpeg", "-y", "-ss", "1", "-i", video,
                        "-frames:v", "1", tmp], check=True, capture_output=True)
        img = Image.open(tmp).convert("RGB")
        img.thumbnail((256, 256))
        arr = np.asarray(img).astype(np.float32) / 255.0
        os.unlink(tmp)
        # 简易 sRGB -> XYZ 近似（MVP；P1 换 colour-science ΔE00）
        xyz = np.dot(arr, np.array([[0.4124, 0.3576, 0.1805],
                                    [0.2126, 0.7152, 0.0722],
                                    [0.0193, 0.1192, 0.9505]]).T)
        return xyz.reshape(-1, 3).mean(axis=0)

    return float(np.linalg.norm(_lab_mean(shot_a) - _lab_mean(shot_b)) * 100.0)