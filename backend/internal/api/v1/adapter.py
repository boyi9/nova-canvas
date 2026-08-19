"""
AI-001 OpenAI 兼容接口适配器
================================

统一的模型后端适配层，屏蔽 OpenAI / Azure OpenAI / 自建中转站（含本地 Ollama）的差异，
对外暴露与 OpenAI 兼容的请求/响应结构。

设计约束（见 .continue/knowledge/coding-rules.md）：
- 仅使用 Python 标准库，零新增第三方依赖（MIT 合规）
- 所有密钥经环境变量注入，禁止硬编码
- 请求/响应结构对齐 OpenAI REST 规范
- 支持流式（SSE）与同步两种模式

注意：本项目 Web 后端为 Go（Gin），本适配器为独立的 Python 推理代理服务，
通过 HTTP 与 Go 后端通信，Ollama 走 http://localhost:11434。
"""

from __future__ import annotations

import base64
import json
import os
import urllib.request
import urllib.error
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, List, Optional


# --------------------------------------------------------------------------- #
# 数据结构（对齐 OpenAI 规范）
# --------------------------------------------------------------------------- #
@dataclass
class ChatMessage:
    role: str
    content: str
    name: Optional[str] = None


@dataclass
class GenerationRequest:
    model: str
    messages: List[ChatMessage] = field(default_factory=list)
    temperature: float = 0.7
    top_p: float = 1.0
    max_tokens: int = 2048
    stream: bool = False
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class GenerationResponse:
    id: str
    model: str
    choices: List[Dict[str, Any]]
    usage: Dict[str, int] = field(default_factory=dict)


class AdapterError(Exception):
    """适配器层统一异常。"""

    def __init__(self, message: str, status_code: int = 500) -> None:
        super().__init__(message)
        self.status_code = status_code


# --------------------------------------------------------------------------- #
# 图像生成数据结构（对齐 OpenAI images 规范）
# --------------------------------------------------------------------------- #
@dataclass
class ImageGenerationRequest:
    prompt: str
    model: str = ""
    n: int = 1
    size: str = "1024x1024"
    negative_prompt: str = ""
    reference_image_b64: Optional[str] = None  # i2i 时传入 base64 图片
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ImageGenerationResponse:
    id: str
    model: str
    created: int
    data: List[Dict[str, str]]  # [{"url": ...} | {"b64_json": ...}]


@dataclass
class AudioGenerationRequest:
    text: str
    model: str = "tts-1"
    voice: str = "alloy"  # alloy/echo/fable/onyx/nova/shimmer
    response_format: str = "mp3"
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AudioGenerationResponse:
    id: str
    model: str
    audio_b64: str  # base64 编码音频字节


@dataclass
class VideoGenerationRequest:
    prompt: str
    model: str = ""
    duration_sec: int = 5
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class VideoGenerationResponse:
    id: str
    model: str
    video_url: str  # 或 b64；骨架阶段返回占位


# --------------------------------------------------------------------------- #
# 适配器基类
# --------------------------------------------------------------------------- #
class BaseAdapter(ABC):
    """所有后端适配器的抽象基类。"""

    def __init__(self, base_url: str, api_key: str = "") -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    @abstractmethod
    def chat(self, req: GenerationRequest) -> GenerationResponse:
        """同步生成。"""

    @abstractmethod
    def chat_stream(self, req: GenerationRequest) -> Iterator[str]:
        """流式生成，逐块返回 SSE 文本。"""

    @abstractmethod
    def generate_image(self, req: ImageGenerationRequest) -> ImageGenerationResponse:
        """文生图。"""

    @abstractmethod
    def edit_image(self, req: ImageGenerationRequest) -> ImageGenerationResponse:
        """图生图（以 reference_image_b64 为输入）。"""

    @abstractmethod
    def generate_audio(self, req: AudioGenerationRequest) -> AudioGenerationResponse:
        """文本转语音。"""

    @abstractmethod
    def generate_video(self, req: VideoGenerationRequest) -> VideoGenerationResponse:
        """文本转视频（骨架阶段未配置时显式 501）。"""

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _post(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, headers=self._headers(), method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="ignore")
            raise AdapterError(f"上游返回错误: {body}", status_code=exc.code)
        except urllib.error.URLError as exc:
            raise AdapterError(f"无法连接上游: {exc.reason}", status_code=502)

    def _post_raw(self, path: str, payload: Dict[str, Any]) -> bytes:
        """发送 POST 并返回原始字节（用于音频等非 JSON 响应）。"""
        url = f"{self.base_url}{path}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, headers=self._headers(), method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="ignore")
            raise AdapterError(f"上游返回错误: {body}", status_code=exc.code)
        except urllib.error.URLError as exc:
            raise AdapterError(f"无法连接上游: {exc.reason}", status_code=502)


# --------------------------------------------------------------------------- #
# 具体实现
# --------------------------------------------------------------------------- #
class OpenAIAdapter(BaseAdapter):
    """官方 OpenAI API。"""

    def chat(self, req: GenerationRequest) -> GenerationResponse:
        payload = self._to_openai_payload(req)
        raw = self._post("/v1/chat/completions", payload)
        return self._from_openai_payload(raw)

    def chat_stream(self, req: GenerationRequest) -> Iterator[str]:
        raise NotImplementedError("OpenAI 流式需 httpx，本期骨架未启用")

    def generate_image(self, req: ImageGenerationRequest) -> ImageGenerationResponse:
        payload = {
            "prompt": req.prompt,
            "model": req.model or "dall-e-3",
            "n": req.n,
            "size": req.size,
            "response_format": "b64_json",
            **req.extra,
        }
        raw = self._post("/v1/images/generations", payload)
        return ImageGenerationResponse(
            id=raw.get("id", ""),
            model=req.model or "dall-e-3",
            created=raw.get("created", 0),
            data=raw.get("data", []),
        )

    def edit_image(self, req: ImageGenerationRequest) -> ImageGenerationResponse:
        path = "/v1/images/edits"
        payload = {
            "prompt": req.prompt,
            "model": req.model or "dall-e-2",
            "n": req.n,
            "size": req.size,
            "image": req.reference_image_b64,
            **req.extra,
        }
        raw = self._post(path, payload)
        return ImageGenerationResponse(
            id=raw.get("id", ""),
            model=req.model or "dall-e-2",
            created=raw.get("created", 0),
            data=raw.get("data", []),
        )

    def generate_audio(self, req: AudioGenerationRequest) -> AudioGenerationResponse:
        payload = {
            "model": req.model,
            "input": req.text,
            "voice": req.voice,
            "response_format": req.response_format,
            **req.extra,
        }
        raw_bytes = self._post_raw("/v1/audio/speech", payload)
        return AudioGenerationResponse(
            id="",
            model=req.model,
            audio_b64=base64.b64encode(raw_bytes).decode("ascii"),
        )

    def generate_video(self, req: VideoGenerationRequest) -> VideoGenerationResponse:
        raise AdapterError(
            "OpenAI 暂无公开视频生成标准 API，需经 ADR 批准接入专有视频服务",
            status_code=501,
        )

    def _to_openai_payload(self, req: GenerationRequest) -> Dict[str, Any]:
        return {
            "model": req.model,
            "messages": [vars(m) for m in req.messages],
            "temperature": req.temperature,
            "top_p": req.top_p,
            "max_tokens": req.max_tokens,
            "stream": req.stream,
            **req.extra,
        }

    def _from_openai_payload(self, raw: Dict[str, Any]) -> GenerationResponse:
        return GenerationResponse(
            id=raw.get("id", ""),
            model=raw.get("model", ""),
            choices=raw.get("choices", []),
            usage=raw.get("usage", {}),
        )


class AzureAdapter(BaseAdapter):
    """Azure OpenAI，URL 结构为 /openai/deployments/{deploy}/chat/completions。"""

    def __init__(self, base_url: str, api_key: str, api_version: str) -> None:
        super().__init__(base_url, api_key)
        self.api_version = api_version

    def chat(self, req: GenerationRequest) -> GenerationResponse:
        path = f"/openai/deployments/{req.model}/chat/completions?api-version={self.api_version}"
        payload = {
            "messages": [vars(m) for m in req.messages],
            "temperature": req.temperature,
            "max_tokens": req.max_tokens,
        }
        raw = self._post(path, payload)
        return GenerationResponse(
            id=raw.get("id", ""),
            model=req.model,
            choices=raw.get("choices", []),
            usage=raw.get("usage", {}),
        )

    def chat_stream(self, req: GenerationRequest) -> Iterator[str]:
        raise NotImplementedError("Azure 流式本期未启用")

    def generate_image(self, req: ImageGenerationRequest) -> ImageGenerationResponse:
        path = f"/openai/deployments/{req.model or 'dall-e-3'}/images/generations?api-version={self.api_version}"
        payload = {
            "prompt": req.prompt,
            "n": req.n,
            "size": req.size,
            "response_format": "b64_json",
            **req.extra,
        }
        raw = self._post(path, payload)
        return ImageGenerationResponse(
            id=raw.get("id", ""),
            model=req.model or "dall-e-3",
            created=raw.get("created", 0),
            data=raw.get("data", []),
        )

    def edit_image(self, req: ImageGenerationRequest) -> ImageGenerationResponse:
        path = f"/openai/deployments/{req.model or 'dall-e-2'}/images/edits?api-version={self.api_version}"
        payload = {
            "prompt": req.prompt,
            "n": req.n,
            "size": req.size,
            "image": req.reference_image_b64,
            **req.extra,
        }
        raw = self._post(path, payload)
        return ImageGenerationResponse(
            id=raw.get("id", ""),
            model=req.model or "dall-e-2",
            created=raw.get("created", 0),
            data=raw.get("data", []),
        )

    def generate_audio(self, req: AudioGenerationRequest) -> AudioGenerationResponse:
        path = f"/openai/deployments/{req.model}/audio/speech?api-version={self.api_version}"
        payload = {
            "model": req.model,
            "input": req.text,
            "voice": req.voice,
            "response_format": req.response_format,
            **req.extra,
        }
        raw_bytes = self._post_raw(path, payload)
        return AudioGenerationResponse(
            id="",
            model=req.model,
            audio_b64=base64.b64encode(raw_bytes).decode("ascii"),
        )

    def generate_video(self, req: VideoGenerationRequest) -> VideoGenerationResponse:
        raise AdapterError(
            "Azure 暂无公开视频生成标准 API，需经 ADR 批准接入专有视频服务",
            status_code=501,
        )


class OllamaAdapter(BaseAdapter):
    """本地 Ollama（0.32.14）兼容适配，经 /api/chat 接入。"""

    def chat(self, req: GenerationRequest) -> GenerationResponse:
        payload = {
            "model": req.model,
            "messages": [{"role": m.role, "content": m.content} for m in req.messages],
            "options": {"temperature": req.temperature, "top_p": req.top_p},
            "stream": False,
        }
        raw = self._post("/api/chat", payload)
        content = raw.get("message", {}).get("content", "")
        return GenerationResponse(
            id=raw.get("model", req.model),
            model=req.model,
            choices=[{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
            usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        )

    def chat_stream(self, req: GenerationRequest) -> Iterator[str]:
        payload = {
            "model": req.model,
            "messages": [{"role": m.role, "content": m.content} for m in req.messages],
            "stream": True,
        }
        # Ollama SSE：逐行返回 JSON，含 "message":{"content": "..."}
        url = f"{self.base_url}/api/chat"
        data = json.dumps(payload).encode("utf-8")
        req_obj = urllib.request.Request(url, data=data, headers=self._headers(), method="POST")
        with urllib.request.urlopen(req_obj, timeout=60) as resp:
            for line in resp:
                line = line.decode("utf-8").strip()
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue
                delta = chunk.get("message", {}).get("content", "")
                if delta:
                    yield delta

    def generate_image(self, req: ImageGenerationRequest) -> ImageGenerationResponse:
        model = req.model or os.environ.get("OLLAMA_IMAGE_MODEL", "")
        if not model:
            raise AdapterError(
                "Ollama 本地未配置图像模型（设置环境变量 OLLAMA_IMAGE_MODEL），生图能力不可用",
                status_code=501,
            )
        payload = {
            "model": model,
            "prompt": req.prompt,
            "images": [req.reference_image_b64] if req.reference_image_b64 else [],
            "options": {"num_predict": req.n},
        }
        raw = self._post("/api/generate", payload)
        out = raw.get("response", "")
        return ImageGenerationResponse(
            id=raw.get("model", model),
            model=model,
            created=0,
            data=[{"b64_json": out}] if out else [],
        )

    def edit_image(self, req: ImageGenerationRequest) -> ImageGenerationResponse:
        if not req.reference_image_b64:
            raise AdapterError("图生图需要提供 reference_image_b64", status_code=400)
        return self.generate_image(req)

    def generate_audio(self, req: AudioGenerationRequest) -> AudioGenerationResponse:
        raise AdapterError(
            "Ollama 本地模型不支持音频生成，请切换 provider=openai/azure",
            status_code=501,
        )

    def generate_video(self, req: VideoGenerationRequest) -> VideoGenerationResponse:
        raise AdapterError(
            "Ollama 本地模型不支持视频生成，请切换 provider=openai/azure",
            status_code=501,
        )


# --------------------------------------------------------------------------- #
# 工厂
# --------------------------------------------------------------------------- #
def build_adapter(provider: str, **kwargs: Any) -> BaseAdapter:
    """根据 provider 构建适配器实例。"""
    provider = provider.lower()
    if provider == "openai":
        return OpenAIAdapter(
            base_url=kwargs.get("base_url", "https://api.openai.com"),
            api_key=os.environ.get("OPENAI_API_KEY", ""),
        )
    if provider == "azure":
        return AzureAdapter(
            base_url=kwargs.get("base_url", ""),
            api_key=os.environ.get("AZURE_OPENAI_KEY", ""),
            api_version=kwargs.get("api_version", "2024-02-15-preview"),
        )
    if provider == "ollama":
        return OllamaAdapter(
            base_url=kwargs.get("base_url", "http://127.0.0.1:11434"),
            api_key="",
        )
    raise AdapterError(f"未知 provider: {provider}", status_code=400)


__all__ = [
    "ChatMessage",
    "GenerationRequest",
    "GenerationResponse",
    "ImageGenerationRequest",
    "ImageGenerationResponse",
    "AudioGenerationRequest",
    "AudioGenerationResponse",
    "VideoGenerationRequest",
    "VideoGenerationResponse",
    "AdapterError",
    "BaseAdapter",
    "OpenAIAdapter",
    "AzureAdapter",
    "OllamaAdapter",
    "build_adapter",
]
