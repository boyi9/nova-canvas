"""
server.py — 纯标准库实现的 MCP stdio Server（AI-001 能力接入层）

不依赖 mcp PyPI SDK，手工实现 JSON-RPC 2.0 over stdio。
暴露工具：ai_chat / ai_text_to_image / ai_image_to_image / ai_edit_image /
         ai_text_to_audio（带熔断）/ ai_text_to_video（带熔断）

启动：python -m backend.mcp.server
测试：MCPServer.handle(msg) 为纯函数，可直接单测。
"""

from __future__ import annotations

import json
import sys
from typing import Any, Dict, List, Optional

from backend.service.circuit_breaker import (
    BreakerConfig,
    BudgetExceededError,
    CircuitBreaker,
    CircuitOpenError,
    RequestTimeoutError,
)
from backend.service import chat as chat_svc
from backend.service import t2i as t2i_svc
from backend.service import i2i as i2i_svc
from backend.service import edit as edit_svc
from backend.service import audio as audio_svc
from backend.service import video as video_svc
from backend.service import cost_metrics as _cost
from backend.internal.api.v1.adapter import (
    AdapterError,
    ChatMessage,
)


SERVER_INFO = {
    "name": "nova-canvas-ai001-mcp",
    "version": "0.1.0",
}

# 高成本调用走熔断：音频/视频默认超时放宽但仍受控，月度预算 500 USD
_AUDIO_BREAKER = CircuitBreaker(
    "mcp-audio",
    BreakerConfig(request_timeout_sec=30, monthly_budget_usd=500),
)
_VIDEO_BREAKER = CircuitBreaker(
    "mcp-video",
    BreakerConfig(request_timeout_sec=60, monthly_budget_usd=500),
)


def _text(content: str) -> List[Dict[str, Any]]:
    return [{"type": "text", "text": content}]


def _tool(name: str, description: str, schema: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": schema,
        },
    }


class MCPServer:
    def list_tools(self) -> List[Dict[str, Any]]:
        return [
            _tool(
                "ai_chat",
                "文本问答/对话，复用 BaseAdapter.chat，可指定 provider 与模型",
                {
                    "messages": {"type": "array", "description": "对话历史 [{role,content}]"},
                    "provider": {"type": "string", "description": "ollama/openai/azure，默认 ollama"},
                    "model": {"type": "string", "description": "模型名，可空"},
                    "temperature": {"type": "number"},
                    "max_tokens": {"type": "integer"},
                },
            ),
            _tool(
                "ai_text_to_image",
                "文本生成图像（OpenAI / Ollama 多模态）",
                {
                    "prompt": {"type": "string"},
                    "provider": {"type": "string"},
                    "model": {"type": "string"},
                    "size": {"type": "string"},
                    "n": {"type": "integer"},
                },
            ),
            _tool(
                "ai_image_to_image",
                "图生图（以 image_b64 为输入）",
                {
                    "image_b64": {"type": "string"},
                    "prompt": {"type": "string"},
                    "provider": {"type": "string"},
                    "model": {"type": "string"},
                    "size": {"type": "string"},
                },
            ),
            _tool(
                "ai_edit_image",
                "参考图编辑（以 reference_image_b64 为输入）",
                {
                    "reference_image_b64": {"type": "string"},
                    "prompt": {"type": "string"},
                    "provider": {"type": "string"},
                    "model": {"type": "string"},
                    "size": {"type": "string"},
                },
            ),
            _tool(
                "ai_text_to_audio",
                "文本转语音（默认 OpenAI/Azure，带成本熔断）",
                {
                    "text": {"type": "string"},
                    "provider": {"type": "string"},
                    "model": {"type": "string"},
                    "voice": {"type": "string"},
                    "response_format": {"type": "string"},
                    "cost_usd": {"type": "number", "description": "本次预估成本，用于预算熔断"},
                },
            ),
            _tool(
                "ai_text_to_video",
                "文本转视频（默认 OpenAI/Azure，带成本熔断，未配置视频服务返回 501）",
                {
                    "prompt": {"type": "string"},
                    "provider": {"type": "string"},
                    "model": {"type": "string"},
                    "duration_sec": {"type": "integer"},
                    "cost_usd": {"type": "number"},
                },
            ),
        ]

    def call_tool(self, name: str, arguments: Dict[str, Any]) -> List[Dict[str, Any]]:
        a = arguments or {}
        try:
            if name == "ai_chat":
                messages = [
                    ChatMessage(role=m["role"], content=str(m.get("content", "")))
                    for m in a.get("messages", [])
                ]
                resp = chat_svc.chat(
                    messages,
                    provider=a.get("provider", "ollama"),
                    model=a.get("model", ""),
                    temperature=float(a.get("temperature", 0.7)),
                    max_tokens=int(a.get("max_tokens", 2048)),
                )
                return _text(resp.choices[0]["message"]["content"])
            if name == "ai_text_to_image":
                resp = t2i_svc.text_to_image(
                    a.get("prompt", ""),
                    provider=a.get("provider", "openai"),
                    model=a.get("model", ""),
                    size=a.get("size", "1024x1024"),
                    n=int(a.get("n", 1)),
                )
                return _text(json.dumps(resp.__dict__, ensure_ascii=False))
            if name == "ai_image_to_image":
                resp = i2i_svc.image_to_image(
                    a.get("image_b64", ""),
                    a.get("prompt", ""),
                    provider=a.get("provider", "openai"),
                    model=a.get("model", ""),
                    size=a.get("size", "1024x1024"),
                )
                return _text(json.dumps(resp.__dict__, ensure_ascii=False))
            if name == "ai_edit_image":
                resp = edit_svc.edit_image(
                    a.get("reference_image_b64", ""),
                    a.get("prompt", ""),
                    provider=a.get("provider", "ollama"),
                    model=a.get("model", ""),
                    size=a.get("size", "1024x1024"),
                )
                return _text(json.dumps(resp.__dict__, ensure_ascii=False))
            if name == "ai_text_to_audio":
                cost = float(a.get("cost_usd", 0.0))
                resp = _AUDIO_BREAKER.call(
                    audio_svc.text_to_audio,
                    a.get("text", ""),
                    provider=a.get("provider", "openai"),
                    model=a.get("model", "tts-1"),
                    voice=a.get("voice", "alloy"),
                    response_format=a.get("response_format", "mp3"),
                    cost_usd=cost,
                )
                _cost.record("ai_text_to_audio", cost, a.get("provider", "openai"))
                return _text(json.dumps(resp.__dict__, ensure_ascii=False))
            if name == "ai_text_to_video":
                cost = float(a.get("cost_usd", 0.0))
                resp = _VIDEO_BREAKER.call(
                    video_svc.text_to_video,
                    a.get("prompt", ""),
                    provider=a.get("provider", "openai"),
                    model=a.get("model", ""),
                    duration_sec=int(a.get("duration_sec", 5)),
                    cost_usd=cost,
                )
                _cost.record("ai_text_to_video", cost, a.get("provider", "openai"))
                return _text(json.dumps(resp.__dict__, ensure_ascii=False))
            raise ValueError(f"未知工具: {name}")
        except (AdapterError, CircuitOpenError, BudgetExceededError, RequestTimeoutError, ValueError) as exc:
            raise

    def handle(self, msg: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        method = msg.get("method", "")
        msg_id = msg.get("id")

        # 通知无需回包
        if method.startswith("notifications/"):
            return None

        if method == "initialize":
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": SERVER_INFO,
                },
            }
        if method == "ping":
            return {"jsonrpc": "2.0", "id": msg_id, "result": {}}
        if method == "tools/list":
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {"tools": self.list_tools()},
            }
        if method == "tools/call":
            params = msg.get("params", {})
            name = params.get("name", "")
            arguments = params.get("arguments", {})
            try:
                content = self.call_tool(name, arguments)
                return {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {"content": content, "isError": False},
                }
            except (AdapterError, CircuitOpenError, BudgetExceededError, RequestTimeoutError, ValueError) as exc:
                return {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {"code": -32000, "message": str(exc)},
                }
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "error": {"code": -32601, "message": f"方法未实现: {method}"},
        }


def _stdio_loop() -> None:
    server = MCPServer()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        resp = server.handle(msg)
        if resp is not None:
            sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    _stdio_loop()
