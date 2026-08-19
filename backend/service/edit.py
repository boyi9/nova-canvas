"""
edit.py — 参考图编辑服务层
复用 adapter.edit_image()，对参考图做指令化编辑/重绘。
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

from backend.internal.api.v1.adapter import (
    ImageGenerationRequest,
    ImageGenerationResponse,
    build_adapter,
)


def edit_image(
    reference_image_b64: str,
    prompt: str,
    provider: str = "ollama",
    model: str = "",
    n: int = 1,
    size: str = "1024x1024",
    extra: Optional[Dict[str, Any]] = None,
) -> ImageGenerationResponse:
    """参考图编辑入口。本地 Ollama 未配图像模型时自动 501 降级。"""
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


__all__ = ["edit_image"]
