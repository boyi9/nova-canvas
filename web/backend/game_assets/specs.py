# -*- coding: utf-8 -*-
# file: backend/game_assets/specs.py
# 作用：游戏资产规格引擎 —— 计算切图/打包结果并校验引擎约束
# 设计：纯规格计算（不生成像素），输出可直接喂给图像模型或打包器的参数。
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Tuple


class SpecError(ValueError):
    """规格参数非法。"""


@dataclass(frozen=True)
class SpriteSheetSpec:
    frame_width: int
    frame_height: int
    columns: int
    rows: int
    count: int
    bleed_px: int
    padding_px: int
    sheet_width: int
    sheet_height: int

    @property
    def cell_width(self) -> int:
        return self.frame_width + self.padding_px * 2 + self.bleed_px * 2

    @property
    def cell_height(self) -> int:
        return self.frame_height + self.padding_px * 2 + self.bleed_px * 2

    @property
    def frames(self) -> List[Tuple[int, int, int, int]]:
        """
        每帧在 sheet 中的 (x, y, w, h)。
        按 cell 步长推进 —— 不能用打包后尺寸反推，否则 padding/bleed 会导致帧数错乱。
        """
        out: List[Tuple[int, int, int, int]] = []
        inset = self.padding_px + self.bleed_px
        for r in range(self.rows):
            for c in range(self.columns):
                out.append(
                    (
                        c * self.cell_width + inset,
                        r * self.cell_height + inset,
                        self.frame_width,
                        self.frame_height,
                    )
                )
        return out


@dataclass(frozen=True)
class TextureSpec:
    width: int
    height: int
    tileable: bool
    mipmaps: bool
    anisotropy: int
    format: str
    srgb: bool
    estimated_bytes: int


@dataclass(frozen=True)
class TilemapSpec:
    columns: int
    rows: int
    tile_width: int
    tile_height: int
    layer_count: int
    estimated_bytes: int


# ── 预设 ────────────────────────────────────────────────────────────────
SPRITE_PRESETS: Dict[str, dict] = {
    "platformer": {
        "frame_width": 32, "frame_height": 32, "columns": 8, "rows": 8,
        "bleed_px": 2, "padding_px": 2, "description": "横版跳跃角色 8 向 × 8 帧",
    },
    "rpg_walk": {
        "frame_width": 64, "frame_height": 64, "columns": 8, "rows": 4,
        "bleed_px": 2, "padding_px": 2, "description": "RPG 四方向行走",
    },
    "pixel_art_small": {
        "frame_width": 16, "frame_height": 16, "columns": 16, "rows": 16,
        "bleed_px": 1, "padding_px": 1, "description": "16×16 像素风大图集",
    },
    "idle_animation": {
        "frame_width": 128, "frame_height": 128, "columns": 6, "rows": 1,
        "bleed_px": 4, "padding_px": 4, "description": "高质量 idle 循环",
    },
    "effects_strip": {
        "frame_width": 96, "frame_height": 96, "columns": 10, "rows": 5,
        "bleed_px": 2, "padding_px": 2, "description": "特效序列帧",
    },
}

TILEMAP_PRESETS: Dict[str, dict] = {
    "topdown_16": {"tile_width": 16, "tile_height": 16, "columns": 40, "rows": 40, "layer_count": 3},
    "topdown_32": {"tile_width": 32, "tile_height": 32, "columns": 60, "rows": 60, "layer_count": 4},
    "isometric_64": {"tile_width": 64, "tile_height": 32, "columns": 50, "rows": 50, "layer_count": 5},
    "platformer_32": {"tile_width": 32, "tile_height": 32, "columns": 80, "rows": 30, "layer_count": 3},
}

# GPU 纹理尺寸上限（保守取 8192，兼容主流移动端）
_MAX_DIM = 8192


def pack_grid(count: int, columns: int) -> Tuple[int, int]:
    """按行列数打包 count 帧，返回 (columns, rows)。"""
    if count <= 0:
        raise SpecError("帧数必须为正")
    if columns <= 0:
        raise SpecError("列数必须为正")
    rows = math.ceil(count / columns)
    return columns, rows


def slice_frames(
    sheet_width: int, sheet_height: int, frame_width: int, frame_height: int
) -> List[Tuple[int, int, int, int]]:
    """生成每帧的 (x, y, w, h) 矩形列表。"""
    if frame_width <= 0 or frame_height <= 0:
        raise SpecError("帧尺寸必须为正")
    out: List[Tuple[int, int, int, int]] = []
    rows = sheet_height // frame_height
    cols = sheet_width // frame_width
    for r in range(rows):
        for c in range(cols):
            out.append((c * frame_width, r * frame_height, frame_width, frame_height))
    return out


def validate_bleed(bleed_px: int, frame_width: int) -> None:
    """出血不能超过帧尺寸（否则浪费显存）。"""
    if bleed_px < 0:
        raise SpecError("出血不能为负")
    if bleed_px * 2 >= frame_width:
        raise SpecError(f"出血 {bleed_px}px 过大（≥ 帧宽的一半 {frame_width // 2}）")


def plan_sprite_sheet(
    frame_width: int,
    frame_height: int,
    count: int,
    columns: int = 0,
    rows: int = 0,
    bleed_px: int = 2,
    padding_px: int = 2,
) -> SpriteSheetSpec:
    """
    计算 sprite sheet 规格。给定 count（rows 可由 columns 推出），
    或直接给定 columns × rows。返回含打包尺寸的完整规格。
    """
    if frame_width <= 0 or frame_height <= 0:
        raise SpecError("帧尺寸必须为正")
    validate_bleed(bleed_px, frame_width)
    if padding_px < 0:
        raise SpecError("内边距不能为负")

    if columns > 0 and rows > 0:
        total = columns * rows
    elif columns > 0:
        columns, rows = pack_grid(count, columns)
        total = columns * rows
    elif rows > 0:
        columns = math.ceil(count / rows)
        total = columns * rows
    else:
        # 未指定排布：取接近正方形的布局
        columns = math.ceil(math.sqrt(count))
        rows = math.ceil(count / columns)
        total = columns * rows

    # 每帧含 padding 的占位尺寸
    cell_w = frame_width + padding_px * 2 + bleed_px * 2
    cell_h = frame_height + padding_px * 2 + bleed_px * 2
    sheet_width = cell_w * columns
    sheet_height = cell_h * rows

    if sheet_width > _MAX_DIM or sheet_height > _MAX_DIM:
        raise SpecError(
            f"打包后尺寸 {sheet_width}×{sheet_height} 超过上限 {_MAX_DIM}，请减少帧数或帧尺寸"
        )

    return SpriteSheetSpec(
        frame_width=frame_width,
        frame_height=frame_height,
        columns=columns,
        rows=rows,
        count=total,
        bleed_px=bleed_px,
        padding_px=padding_px,
        sheet_width=sheet_width,
        sheet_height=sheet_height,
    )


def plan_texture(
    width: int,
    height: int,
    tileable: bool = True,
    mipmaps: bool = True,
    anisotropy: int = 4,
    format: str = "rgba8888",
    srgb: bool = True,
) -> TextureSpec:
    """计算纹理规格与显存占用。"""
    if width <= 0 or height <= 0:
        raise SpecError("纹理尺寸必须为正")
    if width > _MAX_DIM or height > _MAX_DIM:
        raise SpecError(f"纹理尺寸超过上限 {_MAX_DIM}")
    if anisotropy not in (1, 2, 4, 8, 16):
        raise SpecError("anisotropy 只能是 1/2/4/8/16")
    if format not in ("rgba8888", "rgb888", "rg16f"):
        raise SpecError(f"不支持的格式: {format}")

    bpp = {"rgba8888": 4, "rgb888": 3, "rg16f": 4}[format]
    estimated = width * height * bpp
    if mipmaps:
        estimated = int(estimated * 4 / 3)  # mip 链约 +33%
    return TextureSpec(
        width=width,
        height=height,
        tileable=tileable,
        mipmaps=mipmaps,
        anisotropy=anisotropy,
        format=format,
        srgb=srgb,
        estimated_bytes=estimated,
    )


def plan_tilemap(
    columns: int,
    rows: int,
    tile_width: int = 16,
    tile_height: int = 16,
    layer_count: int = 1,
) -> TilemapSpec:
    """计算 tilemap 规格与索引数据量。"""
    if columns <= 0 or rows <= 0:
        raise SpecError("地图尺寸必须为正")
    if layer_count <= 0:
        raise SpecError("图层数必须为正")
    # 索引用 uint16（瓦片集上限 65535）
    estimated = columns * rows * layer_count * 2
    return TilemapSpec(
        columns=columns,
        rows=rows,
        tile_width=tile_width,
        tile_height=tile_height,
        layer_count=layer_count,
        estimated_bytes=estimated,
    )