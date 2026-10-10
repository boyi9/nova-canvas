# -*- coding: utf-8 -*-
# file: backend/models/providers/aliyun_provider.py
# 作用：阿里云百炼（DashScope）适配器（Qwen-Image / Qwen LLM）
import time
from typing import Any, Dict, List

from .base import (
    GenerationRequest,
    GenerationResult,
    ProviderAdapter,
    ProviderError,
)

DASHSCOPE_IMAGE_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis"
DASHSCOPE_COMPAT_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/images/generations"
DASHSCOPE_LLM_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"


class AliyunProvider(ProviderAdapter):
    alias = "aliyun"
    provider_key = "aliyun"

    @classmethod
    def _env_names(cls) -> List[str]:
        return ["DASHSCOPE_API_KEY", "ALIYUN_API_KEY", "ALIBABA_CLOUD_API_KEY"]

    def generate_image(self, model: str, req: GenerationRequest) -> GenerationResult:
        self.require_configured()
        import httpx

        started = time.time()
        payload: Dict[str, Any] = {
            "model": model,
            "input": {"prompt": req.prompt},
            "parameters": {
                "size": f"{req.width}x{req.height}",
                "n": 1,
                "response_format": "url",
            },
        }
        if req.reference_images:
            payload["input"]["ref_img"] = req.reference_images[0]
            if req.negative_prompt:
                payload["parameters"]["negative_prompt"] = req.negative_prompt

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        }

        try:
            resp = httpx.post(
                DASHSCOPE_IMAGE_URL,
                json=payload,
                headers=headers,
                timeout=30.0,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise ProviderError(f"DashScope 图像 HTTP {e.response.status_code}: {e.response.text[:300]}") from e
        except httpx.HTTPError as e:
            raise ProviderError(f"DashScope 图像网络错误: {e}") from e

        data = resp.json()
        output = data.get("output", {})
        task_id = output.get("task_id", "")
        # 异步接口：返回任务 id，轮询由 async_job 层负责
        return GenerationResult(
            provider=self.provider_key,
            model=model,
            output_type="image",
            outputs=[],
            latency_ms=self._elapsed_ms(started),
            raw={"task_id": task_id, "status": output.get("task_status", "PENDING")},
        )

    def generate_text(self, model: str, prompt: str, **kwargs: Any) -> GenerationResult:
        """LLM 编排调用（兼容模式）"""
        self.require_configured()
        import httpx

        started = time.time()
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            **kwargs,
        }
        try:
            resp = httpx.post(
                DASHSCOPE_LLM_URL,
                json=payload,
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=30.0,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise ProviderError(f"DashScope LLM HTTP {e.response.status_code}: {e.response.text[:300]}") from e
        except httpx.HTTPError as e:
            raise ProviderError(f"DashScope LLM 网络错误: {e}") from e

        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return GenerationResult(
            provider=self.provider_key,
            model=model,
            output_type="text",
            outputs=[content],
            latency_ms=self._elapsed_ms(started),
            raw={"usage": data.get("usage", {})},
        )
