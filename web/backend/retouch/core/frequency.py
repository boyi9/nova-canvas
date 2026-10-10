# -*- coding: utf-8 -*-
# file: backend/retouch/core/frequency.py
# 作用：NC-RET-03 智能修图核心（附录 A，已实测）—— 频率分离 / 肤色掩码 / 中性灰磨皮 / 祛痘祛斑 / 纹理量化
# 依赖：numpy + Pillow
from __future__ import annotations

import numpy as np
from PIL import Image, ImageFilter


def _to_arr(img):
    return np.asarray(img.convert("RGB"), dtype=np.float32)


def _to_img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def frequency_split(img, radius=12.0):
    """频率分离 -> (低频, 高频)。低频=光影/色彩/肤色不均，高频=纹理/痘痘/毛孔。"""
    arr = _to_arr(img)
    low = np.asarray(
        img.convert("RGB").filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32
    )
    return low, arr - low + 128.0


def skin_mask(img, feather=2.0):
    """YCbCr 肤色检测 -> float32 [0,1] 掩码（已羽化）。"""
    arr = _to_arr(img)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
    m = (y > 60) & (cb > 77) & (cb < 127) & (cr > 133) & (cr < 173)
    mimg = _to_img(m.astype(np.float32) * 255)
    return (
        np.asarray(
            mimg.filter(ImageFilter.GaussianBlur(feather)) if feather > 0 else mimg,
            dtype=np.float32,
        )
        / 255.0
    )


def neutral_grey_retouch(img, radius=12.0, smooth=0.7, amp=3.0, texture=1.0, mask=None):
    """中性灰磨皮（低频通路）：压掉肤色不均/斑块，保留高频纹理。amp=低频压缩倍率。"""
    arr = _to_arr(img)
    low, high = frequency_split(img, radius)
    low_smooth = np.asarray(
        _to_img(low).filter(ImageFilter.GaussianBlur(radius * 1.6)), dtype=np.float32
    )
    low_new = low + (low_smooth - low) * smooth * amp
    high_new = (high - 128.0) * texture + 128.0
    out = low_new + high_new - 128.0
    if mask is None:
        mask = skin_mask(img)
    m = mask[..., None]
    return _to_img(arr * (1 - m) + out * m)


def blemish_remove(img, size=9, strength=0.9, mask=None, t0=8.0, t1=20.0):
    """祛痘/祛斑（高频通路，斑点选择性修正）：仅修正明显比邻域暗的孤立斑点，
    低于 t0 的微纹理与噪声原样保留，从而避免磨皮常见的塑料感。"""
    arr = _to_arr(img)
    low, high = frequency_split(img, 10.0)
    hf = high - 128.0
    if size % 2 == 0:
        size += 1
    med = (
        np.asarray(
            _to_img(hf + 128.0).filter(ImageFilter.MedianFilter(size=size)),
            dtype=np.float32,
        )
        - 128.0
    )
    diff = med - hf
    w = np.clip((diff - t0) / max(t1 - t0, 1e-6), 0.0, 1.0)
    hf_new = hf + np.maximum(diff, 0.0) * w * strength
    out = low + hf_new
    if mask is None:
        mask = skin_mask(img)
    m = mask[..., None]
    return _to_img(arr * (1 - m) + out * m)


def texture_energy(img, radius=6.0):
    """高频纹理能量：越高纹理越丰富（用于判定是否被磨成塑料感）。"""
    _, high = frequency_split(img, radius)
    return float(np.std(high - 128.0))


def spot_contrast(img, radius=12.0):
    """局部斑点对比度：像素比大尺度背景暗出的量（只计正值），用于判定祛痘/祛斑效果。"""
    g = np.asarray(img.convert("L"), dtype=np.float32)
    bg = np.asarray(img.convert("L").filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32)
    return float(np.mean(np.clip(bg - g, 0.0, None)))


def lowfreq_variance(img, radius=24.0):
    """低频肤色不均方差：磨皮有效性指标。"""
    low, _ = frequency_split(img, radius)
    gray = 0.299 * low[..., 0] + 0.587 * low[..., 1] + 0.114 * low[..., 2]
    return float(np.var(gray))
