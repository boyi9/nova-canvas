# -*- coding: utf-8 -*-
# file: backend/routers/game_assets_api.py
# 作用：游戏资产接口 —— sprite sheet / 纹理 / tilemap 规格计算与预设
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from web.backend.game_assets import (
    SPRITE_PRESETS,
    TILEMAP_PRESETS,
    SpecError,
    plan_sprite_sheet,
    plan_texture,
    plan_tilemap,
)

router = APIRouter(prefix="/api/game-assets", tags=["game-assets"])


def _sheet_dict(s) -> Dict[str, Any]:
    return {
        "frame_width": s.frame_width,
        "frame_height": s.frame_height,
        "columns": s.columns,
        "rows": s.rows,
        "count": s.count,
        "bleed_px": s.bleed_px,
        "padding_px": s.padding_px,
        "sheet_width": s.sheet_width,
        "sheet_height": s.sheet_height,
        "frames": [list(f) for f in s.frames],
    }


def _tex_dict(t) -> Dict[str, Any]:
    return {
        "width": t.width,
        "height": t.height,
        "tileable": t.tileable,
        "mipmaps": t.mipmaps,
        "anisotropy": t.anisotropy,
        "format": t.format,
        "srgb": t.srgb,
        "estimated_bytes": t.estimated_bytes,
        "estimated_mb": round(t.estimated_bytes / (1024 * 1024), 2),
    }


def _map_dict(m) -> Dict[str, Any]:
    return {
        "columns": m.columns,
        "rows": m.rows,
        "tile_width": m.tile_width,
        "tile_height": m.tile_height,
        "layer_count": m.layer_count,
        "estimated_bytes": m.estimated_bytes,
        "estimated_kb": round(m.estimated_bytes / 1024, 2),
    }


# ── 请求体 ──────────────────────────────────────────────────────────────
class SpriteSheetIn(BaseModel):
    frame_width: int
    frame_height: int
    count: int
    columns: int = 0
    rows: int = 0
    bleed_px: int = 2
    padding_px: int = 2


class TextureIn(BaseModel):
    width: int
    height: int
    tileable: bool = True
    mipmaps: bool = True
    anisotropy: int = 4
    format: str = "rgba8888"
    srgb: bool = True


class TilemapIn(BaseModel):
    columns: int
    rows: int
    tile_width: int = 16
    tile_height: int = 16
    layer_count: int = 1


# ── 接口 ────────────────────────────────────────────────────────────────
@router.get("/presets", summary="游戏资产预设（sprite/tilemap）")
def presets() -> Dict[str, Any]:
    return {
        "sprite_presets": [
            {"id": k, **{kk: vv for kk, vv in v.items()}} for k, v in SPRITE_PRESETS.items()
        ],
        "tilemap_presets": [
            {"id": k, **{kk: vv for kk, vv in v.items()}} for k, v in TILEMAP_PRESETS.items()
        ],
    }


@router.post("/sprite-sheet", summary="Sprite Sheet 规格计算")
def sprite_sheet(req: SpriteSheetIn) -> Dict[str, Any]:
    try:
        spec = plan_sprite_sheet(
            req.frame_width,
            req.frame_height,
            req.count,
            columns=req.columns,
            rows=req.rows,
            bleed_px=req.bleed_px,
            padding_px=req.padding_px,
        )
    except SpecError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _sheet_dict(spec)


@router.post("/texture", summary="纹理规格与显存占用")
def texture(req: TextureIn) -> Dict[str, Any]:
    try:
        spec = plan_texture(
            req.width,
            req.height,
            tileable=req.tileable,
            mipmaps=req.mipmaps,
            anisotropy=req.anisotropy,
            format=req.format,
            srgb=req.srgb,
        )
    except SpecError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _tex_dict(spec)


@router.post("/tilemap", summary="Tilemap 规格与数据量")
def tilemap(req: TilemapIn) -> Dict[str, Any]:
    try:
        spec = plan_tilemap(
            req.columns,
            req.rows,
            tile_width=req.tile_width,
            tile_height=req.tile_height,
            layer_count=req.layer_count,
        )
    except SpecError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _map_dict(spec)


@router.post("/preset/{preset_id}", summary="按预设展开完整规格")
def apply_preset(preset_id: str, req: Optional[SpriteSheetIn] = None) -> Dict[str, Any]:
    """把预设展开为可直接用于生成的完整规格。"""
    if preset_id in SPRITE_PRESETS:
        p = SPRITE_PRESETS[preset_id]
        try:
            spec = plan_sprite_sheet(
                p["frame_width"],
                p["frame_height"],
                p["columns"] * p["rows"],
                columns=p["columns"],
                rows=p["rows"],
                bleed_px=p["bleed_px"],
                padding_px=p["padding_px"],
            )
        except SpecError as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {"preset": preset_id, "description": p["description"], "spec": _sheet_dict(spec)}

    if preset_id in TILEMAP_PRESETS:
        p = TILEMAP_PRESETS[preset_id]
        spec = plan_tilemap(
            p["columns"],
            p["rows"],
            tile_width=p["tile_width"],
            tile_height=p["tile_height"],
            layer_count=p["layer_count"],
        )
        return {"preset": preset_id, "spec": _map_dict(spec)}

    raise HTTPException(status_code=404, detail=f"未知预设: {preset_id}")