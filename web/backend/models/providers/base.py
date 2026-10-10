# -*- coding: utf-8 -*-
# file: backend/models/providers/base.py
# 作用：P0-6 模型供应商适配层统一接口
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


class ProviderError(RuntimeError):
    """供应商调用失败"""
    pass


class ProviderNotConfiguredError(ProviderError):
    """缺少 API 密钥/配置，不允许静默降级"""
    pass


@dataclass
class GenerationRequest:
    """统一生成请求"""
    prompt: str = ""
    negative_prompt: str = ""
    # 图像
    width: int = 1024
    height: int = 1024
    # 参考图（base64 或 URL）
    reference_images: List[str] = field(default_factory=list)
    # 视频
    duration_s: float = 5.0
    fps: int = 30
    # 通用
    seed: Optional[int] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class GenerationResult:
    """统一生成结果"""
    provider: str
    model: str
    output_type: str  # image | video | text
    outputs: List[str] = field(default_factory=list)  # URL 或 base64
    latency_ms: float = 0.0
    cost_cny: float = 0.0
    raw: Dict[str, Any] = field(default_factory=dict)


class ProviderAdapter(ABC):
    """供应商适配器基类：SDK 层重试一律为 0，重试由网关持有"""

    alias: str = "base"
    provider_key: str = "base"

    def __init__(self, api_key: Optional[str] = None, **kwargs: Any):
        self.api_key = api_key if api_key is not None else self._env_api_key()
        self.kwargs = kwargs

    @classmethod
    @abstractmethod
    def _env_names(cls) -> List[str]:
        """所需的环境变量名列表（任一命中即可）"""
        ...

    @classmethod
    def _env_api_key(cls) -> str:
        import os
        for name in cls._env_names():
            val = os.getenv(name, "")
            if val:
                return val
        return ""

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def require_configured(self) -> None:
        if not self.configured:
            raise ProviderNotConfiguredError(
                f"供应商 '{self.provider_key}' 未配置密钥，需要环境变量之一: {self._env_names()}"
            )

    @abstractmethod
    def generate_image(self, model: str, req: GenerationRequest) -> GenerationResult:
        ...

    def generate_video(self, model: str, req: GenerationRequest) -> GenerationResult:
        raise ProviderError(f"供应商 '{self.provider_key}' 不支持视频生成")

    def poll_video_task(self, model: str, task_id: str) -> GenerationResult:
        """轮询异步视频任务状态。默认不支持；支持异步的供应商覆盖此方法。"""
        raise ProviderError(f"供应商 '{self.provider_key}' 不支持视频任务轮询")

    def health(self) -> Dict[str, Any]:
        return {
            "provider": self.provider_key,
            "configured": self.configured,
            "env_names": self._env_names(),
        }

    @staticmethod
    def _elapsed_ms(started: float) -> float:
        return (time.time() - started) * 1000.0
