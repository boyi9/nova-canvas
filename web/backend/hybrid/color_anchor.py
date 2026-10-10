# 色彩锚定引擎：把实拍素材的色调参数，双向注入 AI 生成与后期调色
# 依赖: pip install pillow numpy
# NC-HYB-03：完整实现见主文档 13.6

import os
import json
import tempfile
import subprocess
from dataclasses import dataclass, asdict, field
from typing import List, Optional

import numpy as np
from PIL import Image

LUT_SIZE = 33


@dataclass
class ColorAnchor:
    anchor_id: str
    ref_frame: str
    kelvin: int
    wb_gain: List[float]          # 灰世界白平衡增益 [r_gain, g_gain, b_gain]
    brightness: float             # 0-1
    contrast: float               # 0-100
    saturation: float             # 0-1
    top_colors: List[List[int]] = field(default_factory=list)
    lighting_prompt: str = ""
    match_strength: int = 70      # 60-80 人像肤色 / 85-100 产品包装高精度色值


def _estimate_kelvin(r_mean: float, b_mean: float) -> int:
    """用 R/B 比值粗略估算色温：比值越大越暖（K 越低）。"""
    ratio = (r_mean + 1e-6) / (b_mean + 1e-6)
    kelvin = 6500.0 / (ratio ** 0.6)
    return int(max(2000, min(12000, kelvin)))


def _lighting_prompt(kelvin: int, contrast: float, saturation: float) -> str:
    """把锚点翻译成可注入 AI 提示词的光线段（含"色温"与"光源方向"关键词）。"""
    temp = "偏暖" if kelvin < 5200 else ("偏冷" if kelvin > 6800 else "中性")
    shadow = "柔和不锐利" if contrast < 45 else "明确有方向"
    sat = "中等偏上" if saturation > 0.28 else ("中等" if saturation > 0.18 else "偏低")
    return f"光源方向与参考帧一致，色温{temp}（约{kelvin}K），阴影{shadow}，整体饱和度{sat}"


def _stats_from_image(img: Image.Image) -> dict:
    img = img.convert("RGB")
    img.thumbnail((512, 512))
    arr = np.asarray(img).astype(np.float32)

    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    r_mean, g_mean, b_mean = float(r.mean()), float(g.mean()), float(b.mean())
    gray = (r_mean + g_mean + b_mean) / 3.0

    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    hsv = np.asarray(img.convert("HSV")).astype(np.float32)

    # 主色 Top3（量化到 32 级后统计频次）
    quant = (arr // 32).astype(np.int32).reshape(-1, 3)
    keys = quant[:, 0] * 1024 + quant[:, 1] * 32 + quant[:, 2]
    uniq, counts = np.unique(keys, return_counts=True)
    order = np.argsort(-counts)[:3]
    top_colors = []
    for idx in order:
        k = int(uniq[idx])
        top_colors.append([
            (k // 1024) * 32 + 16,
            ((k // 32) % 32) * 32 + 16,
            (k % 32) * 32 + 16,
        ])

    return {
        "r_mean": r_mean, "g_mean": g_mean, "b_mean": b_mean, "gray": gray,
        "wb_gain": [round(gray / (r_mean + 1e-6), 4),
                    round(gray / (g_mean + 1e-6), 4),
                    round(gray / (b_mean + 1e-6), 4)],
        "brightness": float(luma.mean() / 255.0),
        "contrast": float(luma.std() / 255.0 * 100.0),
        "saturation": float(hsv[..., 1].mean() / 255.0),
        "top_colors": top_colors,
    }


def extract_anchor(ref_frame: str, anchor_id: str, match_strength: int = 70) -> ColorAnchor:
    """从实拍参考帧提取色彩锚点。

    match_strength 档位（不得随意改动）：
      60-80  人像/肤色一致性（过高肤色发灰）
      85-100 工业产品/包装高精度色值复现
    """
    st = _stats_from_image(Image.open(ref_frame))
    kelvin = _estimate_kelvin(st["r_mean"], st["b_mean"])
    return ColorAnchor(
        anchor_id=anchor_id,
        ref_frame=os.path.abspath(ref_frame),
        kelvin=kelvin,
        wb_gain=st["wb_gain"],
        brightness=round(st["brightness"], 4),
        contrast=round(st["contrast"], 2),
        saturation=round(st["saturation"], 4),
        top_colors=st["top_colors"],
        lighting_prompt=_lighting_prompt(kelvin, st["contrast"], st["saturation"]),
        match_strength=match_strength,
    )


def probe_video_stats(video_path: str, at_sec: float = 1.0) -> dict:
    """抽一帧，返回该片段的亮度/对比度/饱和度统计（用于计算补偿量）。"""
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False).name
    subprocess.run(["ffmpeg", "-y", "-ss", str(at_sec), "-i", video_path,
                    "-frames:v", "1", tmp], check=True, capture_output=True)
    st = _stats_from_image(Image.open(tmp))
    os.unlink(tmp)
    return st


def write_cube_lut(anchor: ColorAnchor, out_path: str,
                   sat_current: Optional[float] = None, strength: float = 1.0) -> str:
    """生成 33^3 的 .cube LUT，把 AI 片段拉齐到实拍基准。

    - 数据行数必须恰好为 LUT_SIZE^3 = 35937。
    - strength 线性调节校正幅度：0=不改，1=完全校正。
    """
    rg, gg, bg = anchor.wb_gain
    cur = anchor.saturation if sat_current is None else sat_current
    sat_scale = 1.0 + (anchor.saturation - cur) * 1.2

    lines = [
        f'TITLE "NC_ANCHOR_{anchor.anchor_id}"',
        f"LUT_3D_SIZE {LUT_SIZE}",
        "DOMAIN_MIN 0.0 0.0 0.0",
        "DOMAIN_MAX 1.0 1.0 1.0",
        "",
    ]
    step = 1.0 / (LUT_SIZE - 1)
    for i in range(LUT_SIZE):
        for j in range(LUT_SIZE):
            for k in range(LUT_SIZE):
                r, g, b = i * step, j * step, k * step
                nr, ng, nb = r * rg, g * gg, b * bg
                lum = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb
                nr = lum + (nr - lum) * sat_scale
                ng = lum + (ng - lum) * sat_scale
                nb = lum + (nb - lum) * sat_scale
                nr = r + (nr - r) * strength
                ng = g + (ng - g) * strength
                nb = b + (nb - b) * strength
                lines.append(
                    f"{min(max(nr, 0), 1):.6f} {min(max(ng, 0), 1):.6f} {min(max(nb, 0), 1):.6f}"
                )
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return out_path


def save_anchor(anchor: ColorAnchor, path: str) -> str:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(asdict(anchor), f, ensure_ascii=False, indent=2)
    return path


def build_prompt_with_anchor(base_prompt: str, anchor: ColorAnchor) -> str:
    """前向注入：把锚点光线段追加到 AI 生成提示词。"""
    return f"{base_prompt}。{anchor.lighting_prompt}，色彩基准参考帧已锁定"