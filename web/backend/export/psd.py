# -*- coding: utf-8 -*-
# file: backend/export/psd.py
# 作用：最小可用 PSD 二进制写入器（RGB / 8bit / 多图层 / raw 压缩）
# 参考：Adobe PSD File Format Specification（File Header Section + Color Mode Data +
#       Image Resources + Layer & Mask Information + Image Data Section）
from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import List, Optional, Tuple

# PSD 颜色模式
PSD_RGB = 3
# 压缩方式：0=raw, 1=RLE
COMPRESSION_RAW = 0
COMPRESSION_RLE = 1

_BLEND_MODES = {
    "normal": b"norm",
    "multiply": b"mul ",
    "screen": b"scrn",
    "overlay": b"over",
    "darken": b"dark",
    "lighten": b"lite",
    "color dodge": b"div ",
    "color burn": b"burn",
    "hard light": b"hLit",
    "soft light": b"sLit",
    "difference": b"diff",
    "exclusion": b"smud",
}


@dataclass
class Layer:
    """单个 PSD 图层。pixels 为 RGBA uint8 扁平数组（len = width*height*4）。"""

    name: str
    left: int
    top: int
    right: int
    bottom: int
    pixels: bytes  # RGBA, len == (right-left)*(bottom-top)*4
    opacity: float = 1.0  # 0..1
    visible: bool = True
    blend_mode: str = "normal"

    @property
    def width(self) -> int:
        return max(0, self.right - self.left)

    @property
    def height(self) -> int:
        return max(0, self.bottom - self.top)


def _u8(v: int) -> bytes:
    return struct.pack(">B", v & 0xFF)


def _u16(v: int) -> bytes:
    return struct.pack(">H", v & 0xFFFF)


def _u32(v: int) -> bytes:
    return struct.pack(">I", v & 0xFFFFFFFF)


def _i16(v: int) -> bytes:
    return struct.pack(">h", int(v))


def _i32(v: int) -> bytes:
    return struct.pack(">i", int(v))


def _pascal_string(s: str, pad_to: int = 4) -> bytes:
    """Pascal string：1 字节长度 + 内容，整体 pad 到 pad_to 的倍数。"""
    raw = s.encode("utf-8", errors="replace")[:255]
    data = _u8(len(raw)) + raw
    remainder = len(data) % pad_to
    if remainder:
        data += b"\x00" * (pad_to - remainder)
    return data


def _layer_record(layer: Layer) -> bytes:
    rect = _i32(layer.top) + _i32(layer.left) + _i32(layer.bottom) + _i32(layer.right)
    n_channels = 4  # R G B A
    channels = b""
    ch_size = layer.width * layer.height  # 每通道 1 字节
    for ch_id in (0, 1, 2, -1):  # R G B Alpha
        channels += _i16(ch_id) + _u32(ch_size)

    blend = _BLEND_MODES.get(layer.blend_mode.lower(), b"norm")
    opacity_byte = _u8(int(round(layer.opacity * 255)))
    clipping = _u8(0)
    flags = _u8(0 if layer.visible else 2)  # bit1 = invisible
    filler = _u8(0)

    extra_data_len = (
        4  # mask size (0)
        + 4  # blending ranges size (0)
        + len(_pascal_string(layer.name))
        + 4  # additional layer info length (0)
    )

    record = (
        rect
        + _u16(n_channels)
        + channels
        + b"8BIM"
        + blend
        + opacity_byte
        + clipping
        + flags
        + filler
        + _u32(extra_data_len)
        + _u32(0)  # mask
        + _u32(0)  # blending ranges
        + _pascal_string(layer.name)
        + _u32(0)  # additional layer info
    )
    return record


def _channel_data(layer: Layer) -> bytes:
    """按通道顺序 R,G,B,A 输出 raw 像素（每通道 1 字节）。"""
    w, h = layer.width, layer.height
    n = w * h
    if len(layer.pixels) != n * 4:
        raise ValueError(
            f"图层 '{layer.name}' 像素长度不符: 期望 {n * 4}, 实际 {len(layer.pixels)}"
        )
    r = bytearray(n)
    g = bytearray(n)
    b = bytearray(n)
    a = bytearray(n)
    px = layer.pixels
    for i in range(n):
        j = i * 4
        r[i] = px[j]
        g[i] = px[j + 1]
        b[i] = px[j + 2]
        a[i] = px[j + 3]
    return bytes(r) + bytes(g) + bytes(b) + bytes(a)


def _composite_flat(layers: List[Layer], width: int, height: int) -> bytes:
    """合成扁平 RGB（忽略 alpha 简单 over），供 Image Data Section。"""
    buf = bytearray(width * height * 3)
    # 白底
    for i in range(len(buf)):
        buf[i] = 255
    for layer in reversed(layers):  # 底层先画
        if not layer.visible:
            continue
        lw, lh = layer.width, layer.height
        px = layer.pixels
        for y in range(lh):
            gy = layer.top + y
            if gy < 0 or gy >= height:
                continue
            for x in range(lw):
                gx = layer.left + x
                if gx < 0 or gx >= width:
                    continue
                j = (y * lw + x) * 4
                alpha = px[j + 3]
                if alpha == 0:
                    continue
                idx = (gy * width + gx) * 3
                if alpha == 255:
                    buf[idx] = px[j]
                    buf[idx + 1] = px[j + 1]
                    buf[idx + 2] = px[j + 2]
                else:
                    inv = 255 - alpha
                    buf[idx] = (px[j] * alpha + buf[idx] * inv) // 255
                    buf[idx + 1] = (px[j + 1] * alpha + buf[idx + 1] * inv) // 255
                    buf[idx + 2] = (px[j + 2] * alpha + buf[idx + 2] * inv) // 255
    return bytes(buf)


def write_psd(layers: List[Layer], width: int, height: int) -> bytes:
    """
    将图层列表写为 PSD 二进制。
    :param layers: 图层列表（底 → 顶）
    :param width:  画布宽
    :param height: 画布高
    :return: PSD 文件字节
    """
    if width <= 0 or height <= 0:
        raise ValueError("画布尺寸必须为正")
    if not layers:
        raise ValueError("至少需要一个图层")

    # ── File Header Section（26 字节）────────────────────────────────────
    header = (
        b"8BPS"
        + _u16(1)  # version
        + b"\x00" * 6  # reserved
        + _u16(3)  # channels: R G B
        + _u32(height)
        + _u32(width)
        + _u16(8)  # bit depth
        + _u16(PSD_RGB)
    )

    # ── Color Mode Data Section（0）─────────────────────────────────────
    color_mode = _u32(0)

    # ── Image Resources Section（0，可选但推荐放 0）──────────────────────
    image_resources = _u32(0)

    # ── Layer & Mask Information Section ────────────────────────────────
    layer_records = b""
    channel_blobs = b""
    for layer in layers:
        layer_records += _layer_record(layer)
        ch_data = _channel_data(layer)
        # 每通道前缀：channel id (2) + data length (4) + raw data
        # 已在 record 中写 id+length，此处补 data
        channel_blobs += ch_data

    layer_info = _u16(len(layers)) + layer_records + channel_blobs
    # Layer info 需 pad 到偶数
    if len(layer_info) % 2:
        layer_info += b"\x00"
    layer_info_section = _u32(len(layer_info)) + layer_info

    # 全局遮罩（0）
    global_mask = _u32(0)

    layer_mask_section_body = layer_info_section + global_mask
    layer_mask_section = _u32(len(layer_mask_section_body)) + layer_mask_section_body

    # ── Image Data Section（扁平合成，raw）──────────────────────────────
    flat = _composite_flat(layers, width, height)
    image_data = _u16(COMPRESSION_RAW) + flat

    return header + color_mode + image_resources + layer_mask_section + image_data
