# -*- coding: utf-8 -*-
# file: backend/routers/export_api.py
# 作用：导出接口 —— POST /api/export/psd（多图层 PSD 二进制）
from __future__ import annotations

import base64
import io
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from web.backend.export.psd import Layer, write_psd

router = APIRouter(prefix="/api/export", tags=["export"])


class LayerIn(BaseModel):
    name: str = "Layer"
    left: int = 0
    top: int = 0
    width: int
    height: int
    # RGBA base64（len == width*height*4 字节）
    pixels_b64: str
    opacity: float = 1.0
    visible: bool = True
    blend_mode: str = "normal"


class PsdExportIn(BaseModel):
    width: int
    height: int
    layers: List[LayerIn] = Field(default_factory=list)
    # 可选：扁平图（无图层时用），RGB base64
    flat_b64: Optional[str] = None


def _decode_rgba(layer: LayerIn) -> bytes:
    try:
        raw = base64.b64decode(layer.pixels_b64)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"图层 '{layer.name}' base64 解码失败: {e}")
    expected = layer.width * layer.height * 4
    if len(raw) != expected:
        raise HTTPException(
            status_code=400,
            detail=f"图层 '{layer.name}' 像素长度不符: 期望 {expected}, 实际 {len(raw)}",
        )
    return raw


@router.post("/psd", summary="导出多图层 PSD（返回 application/octet-stream 二进制）")
def export_psd(req: PsdExportIn) -> Response:
    if req.width <= 0 or req.height <= 0:
        raise HTTPException(status_code=400, detail="画布尺寸必须为正")

    layers: List[Layer] = []
    if req.layers:
        for li in req.layers:
            if li.width <= 0 or li.height <= 0:
                raise HTTPException(status_code=400, detail=f"图层 '{li.name}' 尺寸非法")
            pixels = _decode_rgba(li)
            layers.append(
                Layer(
                    name=li.name,
                    left=li.left,
                    top=li.top,
                    right=li.left + li.width,
                    bottom=li.top + li.height,
                    pixels=pixels,
                    opacity=max(0.0, min(1.0, li.opacity)),
                    visible=li.visible,
                    blend_mode=li.blend_mode,
                )
            )
    elif req.flat_b64:
        # 扁平模式：把整图当作单个图层
        try:
            raw = base64.b64decode(req.flat_b64)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=f"flat_b64 解码失败: {e}")
        expected = req.width * req.height * 4
        if len(raw) != expected:
            raise HTTPException(
                status_code=400,
                detail=f"flat 像素长度不符: 期望 {expected}, 实际 {len(raw)}",
            )
        layers.append(
            Layer(
                name="Background",
                left=0,
                top=0,
                right=req.width,
                bottom=req.height,
                pixels=raw,
            )
        )
    else:
        raise HTTPException(status_code=400, detail="需要 layers 或 flat_b64")

    try:
        psd_bytes = write_psd(layers, req.width, req.height)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return Response(
        content=psd_bytes,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": 'attachment; filename="export.psd"',
            "Content-Length": str(len(psd_bytes)),
        },
    )
