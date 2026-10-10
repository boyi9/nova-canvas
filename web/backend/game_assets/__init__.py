# -*- coding: utf-8 -*-
# file: backend/game_assets/__init__.py
# 作用：游戏资产生成域 —— sprite sheet / 纹理 / tilemap 的规格计算与校验
from __future__ import annotations

from .specs import (
    SPRITE_PRESETS,
    TILEMAP_PRESETS,
    SpecError,
    SpriteSheetSpec,
    TextureSpec,
    TilemapSpec,
    plan_sprite_sheet,
    plan_texture,
    plan_tilemap,
    pack_grid,
    slice_frames,
    validate_bleed,
)

__all__ = [
    "SPRITE_PRESETS",
    "TILEMAP_PRESETS",
    "SpecError",
    "SpriteSheetSpec",
    "TextureSpec",
    "TilemapSpec",
    "plan_sprite_sheet",
    "plan_texture",
    "plan_tilemap",
    "pack_grid",
    "slice_frames",
    "validate_bleed",
]