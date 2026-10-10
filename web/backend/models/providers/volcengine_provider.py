# -*- coding: utf-8 -*-
# file: backend/models/providers/volcengine_provider.py
# 作用：火山引擎 Ark 适配器（Seedream / Seedance）
import time
from typing import Any, Dict, List

from .base import (
    GenerationRequest,
    GenerationResult,
    ProviderAdapter,
    ProviderError,
)

# Ark OpenAI 兼容图像接口
ARK_IMAGE_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations"
# Ark 视频任务接口
ARK_VIDEO_URL = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks"


class VolcengineProvider(ProviderAdapter):
    alias = "volcengine"
    provider_key = "volcengine"

    @classmethod
    def _env_names(cls) -> List[str]:
        return ["ARK_API_KEY", "VOLCENGINE_API_KEY", "VOLC_ACCESS_KEY"]

    def generate_image(self, model: str, req: GenerationRequest) -> GenerationResult:
        self.require_configured()
        import httpx

        started = time.time()
        payload: Dict[str, Any] = {
            "model": model,
            "prompt": req.prompt,
            "size": f"{req.width}x{req.height}",
            "response_format": "url",
            "n": 1,
        }
        if req.negative_prompt:
            payload["negative_prompt"] = req.negative_prompt
        if req.seed is not None:
            payload["seed"] = req.seed
        if req.reference_images:
            payload["image"] = req.reference_images[0]

        try:
            resp = httpx.post(
                ARK_IMAGE_URL,
                json=payload,
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=60.0,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise ProviderError(f"Ark 图像生成 HTTP {e.response.status_code}: {e.response.text[:300]}") from e
        except httpx.HTTPError as e:
            raise ProviderError(f"Ark 图像生成网络错误: {e}") from e

        data = resp.json()
        outputs = [item.get("url", "") for item in data.get("data", []) if item.get("url")]
        if not outputs:
            raise ProviderError(f"Ark 图像生成无输出: {data}")

        return GenerationResult(
            provider=self.provider_key,
            model=model,
            output_type="image",
            outputs=outputs,
            latency_ms=self._elapsed_ms(started),
            raw={"id": data.get("id", "")},
        )

    def generate_video(self, model: str, req: GenerationRequest) -> GenerationResult:
        self.require_configured()
        import httpx

        started = time.time()
        payload: Dict[str, Any] = {
            "model": model,
            "content": [
                {"type": "text", "text": req.prompt},
            ],
        }
        if req.reference_images:
            payload["content"].append({"type": "image_url", "image_url": {"url": req.reference_images[0]}})

        try:
            resp = httpx.post(
                ARK_VIDEO_URL,
                json=payload,
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=30.0,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise ProviderError(f"Ark 视频任务提交 HTTP {e.response.status_code}: {e.response.text[:300]}") from e
        except httpx.HTTPError as e:
            raise ProviderError(f"Ark 视频任务提交网络错误: {e}") from e

        data = resp.json()
        task_id = data.get("id", "")
        if not task_id:
            raise ProviderError(f"Ark 视频任务无 id: {data}")

        # 简化：P0 阶段提交即返回任务 id；轮询由 async_job 层负责
        return GenerationResult(
            provider=self.provider_key,
            model=model,
            output_type="video",
            outputs=[],
            latency_ms=self._elapsed_ms(started),
            raw={"task_id": task_id, "status": data.get("status", "submitted")},
        )
