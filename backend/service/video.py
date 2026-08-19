"""
video.py — 视频生成服务层（文本转视频）
复用 adapter.generate_video()。当前 OpenAI/Azure 无公开标准 API，调用返回 501；
真实接入须在 circuit_breaker.py 内做成本熔断（见 ADR 005 风险规避）。
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

from backend.internal.api.v1.adapter import (
    VideoGenerationRequest,
    VideoGenerationResponse,
    build_adapter,
)


def text_to_video(
    prompt: str,
    provider: str = "openai",
    model: str = "",
    duration_sec: int = 5,
    extra: Optional[Dict[str, Any]] = None,
) -> VideoGenerationResponse:
    """文本转视频入口。默认 provider=openai；未配置视频服务时显式 501。"""
    adapter = build_adapter(provider)
    req = VideoGenerationRequest(
        prompt=prompt,
        model=model,
        duration_sec=duration_sec,
        extra=extra or {},
    )
    return adapter.generate_video(req)


__all__ = ["text_to_video"]
