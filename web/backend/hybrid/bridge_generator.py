"""AI 补镜与过渡生成（NC-HYB-05）：用前段尾帧 + 后段首帧驱动生成过渡片段，消除跳戏。

主文档 13.8；执行方案批 3。
"""

import os
import subprocess
from dataclasses import dataclass
from typing import Optional

# 过渡提示词模板（固定，不得改动）
BRIDGE_PROMPT = (
    "镜头匀速平移过渡，背景虚化渐进，主体位置稳定不变，"
    "无闪烁无撕裂，丝滑衔接，保持与前后镜头一致的色调与光照方向"
)

# 运镜连续性表：前段结尾运镜 -> 后段开头运镜 -> 判定
# 运镜衔接三原则：
#   1. 前段结束于"缓慢推近"，过渡段也用"缓慢推近"，缩放值需对齐（如均为 1.42x）
#   2. 不使用转场特效——原生动画引擎在首尾帧对齐且平滑度达标时会自动生成
#      像素级渐进过渡，强加淡入淡出反而破坏运动插值路径
#   3. 导出前必须逐帧验证衔接处（观察人物眼部/手指/衣角边缘是否跳动、
#      虚化或亮度突变）
MOTION_CONTINUITY = {
    ("slow_push_in", "slow_push_in"): "OK",
    ("slow_push_in", "static"): "OK",
    ("slow_push_in", "pull_out"): "WARN",
    ("pan_left", "pan_left"): "OK",
    ("pan_left", "pan_right"): "WARN",
    ("pan_left", "static"): "OK",
    ("static", "static"): "OK",
    ("static", "slow_push_in"): "OK",
}

DURATION_TOLERANCE = 0.2  # 过渡片段时长误差上限（秒）


@dataclass
class BridgeRequest:
    prev_shot: str
    next_shot: str
    out_path: str
    duration: float = 3.0
    motion: str = "slow_push_in"
    seed: int = 20260925
    prev_end_move: str = "slow_push_in"
    next_start_move: str = "slow_push_in"


def extract_frame(video: str, at_sec: Optional[float], out_png: str) -> str:
    """at_sec=None 取最后一帧（ffmpeg -sseof -0.1）；否则取指定秒。"""
    if at_sec is None:
        cmd = ["ffmpeg", "-y", "-sseof", "-0.1", "-i", video,
               "-frames:v", "1", "-q:v", "1", out_png]
    else:
        cmd = ["ffmpeg", "-y", "-ss", str(at_sec), "-i", video,
               "-frames:v", "1", "-q:v", "1", out_png]
    os.makedirs(os.path.dirname(out_png) or ".", exist_ok=True)
    subprocess.run(cmd, check=True, capture_output=True)
    return out_png


def check_motion_continuity(prev_move: str, next_move: str) -> str:
    """查运镜连续性表，返回 OK/WARN（表中未列出的组合默认 OK）。"""
    return MOTION_CONTINUITY.get((prev_move, next_move), "OK")


def read_end_scale(video: str) -> float:
    """读取前段尾帧缩放锚点，用于后段首帧对齐（防缩放跳变）。Demo 阶段返回 1.0，P1 接光流解析。"""
    return 1.0


def generate_bridge(req: "BridgeRequest", provider: str = "flf2v") -> str:
    """生成过渡片段。provider: flf2v（自建/商用首尾帧模型）。

    模型不可用时，异常信息包含 provider 名与原始错误。
    """
    if provider != "flf2v":
        raise ValueError(f"unknown bridge provider: {provider}")

    os.makedirs(os.path.dirname(req.out_path) or ".", exist_ok=True)
    tail = extract_frame(req.prev_shot, None, f"/tmp/nc_{req.seed}_tail.png")
    head = extract_frame(req.next_shot, 0.0, f"/tmp/nc_{req.seed}_head.png")

    verdict = check_motion_continuity(req.prev_end_move, req.next_start_move)
    prompt = f"{BRIDGE_PROMPT}，运镜：{req.motion}"

    payload = {
        "first_frame": tail,
        "last_frame": head,
        "prompt": prompt,
        "duration": req.duration,
        "seed": req.seed,
        "motion_continuity": verdict,
    }
    try:
        from backend.models.router import ModelRouter
    except ImportError as e:
        raise RuntimeError(
            f"{provider} 模型不可用（models.router 已移除，尚未接入真实 provider 客户端）: {e}"
        ) from e
    try:
        ModelRouter().invoke("flf2v", payload, out_path=req.out_path)
    except Exception as e:
        raise RuntimeError(f"{provider} 调用失败: {e}") from e
    return req.out_path