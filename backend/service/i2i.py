"""
i2i.py — 图生图（Image-to-Image）服务层
=====================================
高层封装：以参考图（base64）为输入，经 build_adapter 路由到对应后端做图像编辑/重绘。
完全复用 adapter.py 的纯标准库零依赖实现，不引入任何新依赖。
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

from backend.internal.api.v1.adapter import (
    ImageGenerationRequest,
    ImageGenerationResponse,
    build_adapter,
)


def image_to_image(
    reference_image_b64: str,
    prompt: str,
    provider: str = "ollama",
    model: str = "",
    n: int = 1,
    size: str = "1024x1024",
    extra: Optional[Dict[str, Any]] = None,
) -> ImageGenerationResponse:
    """图生图入口。reference_image_b64 为输入参考图的 base64 编码。"""
    if not reference_image_b64:
        raise ValueError("image_to_image 需要 reference_image_b64 参数")
    adapter = build_adapter(provider)
    req = ImageGenerationRequest(
        prompt=prompt,
        model=model or os.environ.get("OLLAMA_IMAGE_MODEL", ""),
        n=n,
        size=size,
        reference_image_b64=reference_image_b64,
        extra=extra or {},
    )
    return adapter.edit_image(req)


__all__ = ["image_to_image"]
