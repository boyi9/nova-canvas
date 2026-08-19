"""
audio.py — 音频生成服务层（文本转语音）
复用 adapter.generate_audio()。音视频逻辑默认走 OpenAI/Azure 链路（Ollama 不支持）。
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

from backend.internal.api.v1.adapter import (
    AudioGenerationRequest,
    AudioGenerationResponse,
    build_adapter,
)


def text_to_audio(
    text: str,
    provider: str = "openai",
    model: str = "tts-1",
    voice: str = "alloy",
    response_format: str = "mp3",
    extra: Optional[Dict[str, Any]] = None,
) -> AudioGenerationResponse:
    """文本转语音入口。默认 provider=openai（Ollama 会 501 降级）。"""
    adapter = build_adapter(provider)
    req = AudioGenerationRequest(
        text=text,
        model=model,
        voice=voice,
        response_format=response_format,
        extra=extra or {},
    )
    return adapter.generate_audio(req)


__all__ = ["text_to_audio"]
