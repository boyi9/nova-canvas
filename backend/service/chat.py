"""
chat.py — 文本问答服务层
复用 adapter.chat()，支持多轮对话上下文。
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.internal.api.v1.adapter import (
    ChatMessage,
    GenerationRequest,
    GenerationResponse,
    build_adapter,
)


def chat(
    messages: List[ChatMessage],
    provider: str = "ollama",
    model: str = "",
    temperature: float = 0.7,
    max_tokens: int = 2048,
    stream: bool = False,
    extra: Optional[Dict[str, Any]] = None,
) -> GenerationResponse:
    """文本问答入口。返回与 OpenAI 兼容的 GenerationResponse。"""
    adapter = build_adapter(provider)
    req = GenerationRequest(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=stream,
        extra=extra or {},
    )
    return adapter.chat(req)


__all__ = ["chat"]
