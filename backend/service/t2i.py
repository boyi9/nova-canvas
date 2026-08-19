"""
t2i.py — 文生图（Text-to-Image）服务层
=====================================
高层封装：组装 ImageGenerationRequest，经 build_adapter 路由到对应后端。
完全复用 adapter.py 的纯标准库零依赖实现，不引入任何新依赖。
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from backend.internal.api.v1.adapter import (
    ImageGenerationRequest,
    ImageGenerationResponse,
    build_adapter,
)


def text_to_image(
    prompt: str,
    provider: str = "ollama",
    model: str = "",
    n: int = 1,
    size: str = "1024x1024",
    negative_prompt: str = "",
    extra: Optional[Dict[str, Any]] = None,
) -> ImageGenerationResponse:
    """文生图入口。provider 默认 ollama，复用本地已加载模型。"""
    adapter = build_adapter(provider)
    req = ImageGenerationRequest(
        prompt=prompt,
        model=model or os.environ.get("OLLAMA_IMAGE_MODEL", ""),
        n=n,
        size=size,
        negative_prompt=negative_prompt,
        extra=extra or {},
    )
    return adapter.generate_image(req)


__all__ = ["text_to_image"]
