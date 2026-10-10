# -*- coding: utf-8 -*-
# file: backend/retouch/portrait.py
# 作用：NC-RET-03 人像精修本地引擎（frequency 栈，L1/L2 可离线执行）
from __future__ import annotations

from typing import Any, Dict, Optional

from PIL import Image

from web.backend.retouch.core.frequency import (
    blemish_remove as _blemish_remove,
    neutral_grey_retouch as _skin_smooth,
)


def _clamp_strength(strength: float) -> float:
    return max(0.0, min(1.0, float(strength)))


def skin_smooth(img: Image.Image, strength: float = 0.5, radius: float = 12.0) -> Image.Image:
    """磨皮：强度 0..1 → 低频压缩参数（默认保守，上限建议 0.85）。"""
    s = _clamp_strength(strength)
    smooth = 0.25 + s * 0.55          # 0.25 ~ 0.80
    amp = 2.0 + s * 2.0               # 2.0 ~ 4.0
    texture = 1.0                     # 高频原样保留（不塑料化关键）
    return _skin_smooth(img, radius=radius, smooth=smooth, amp=amp, texture=texture)


def blemish_remove(img: Image.Image, strength: float = 0.9) -> Image.Image:
    """祛痘/祛斑：斑点选择性修正（t0/t1 软阈值，低于 t0 的纹理不碰）。"""
    s = _clamp_strength(strength)
    # 文档工程初值 t0=8/t1=20 为基准；低强度时更保守（t0 更高）
    t0 = 8.0 + max(0.0, 0.8 - s) * 10.0
    t1 = 20.0 + max(0.0, 0.8 - s) * 10.0
    return _blemish_remove(img, strength=0.5 + s * 0.5, t0=t0, t1=t1)


# 本地可执行算子 → 实现
LOCAL_OPS = {
    "skin_smooth": skin_smooth,
    "blemish_remove": blemish_remove,
}


def execute_local_ops(
    img: Image.Image,
    ops: list,
    strength: float = 0.5,
) -> Image.Image:
    """按编排序执行本地算子；未知算子抛 KeyError。"""
    from web.backend.retouch.orchestrator import order_ops

    out = img
    for op in order_ops(list(ops)):
        fn = LOCAL_OPS.get(op)
        if fn is None:
            raise KeyError(op)
        out = fn(out, strength=strength)
    return out


def local_coverage(ops: list) -> Dict[str, Any]:
    """哪些算子本地可跑、哪些需要外部栈。"""
    from web.backend.retouch.ops import get_op

    covered, external = [], []
    for op in ops:
        if op in LOCAL_OPS:
            covered.append(op)
        else:
            external.append({"op": op, "engine": get_op(op).engine})
    return {"local": covered, "external": external}
