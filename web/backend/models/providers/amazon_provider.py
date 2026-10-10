# -*- coding: utf-8 -*-
# file: backend/models/providers/amazon_provider.py
# 作用：Amazon Bedrock Nova Canvas 适配器
import time
from typing import Any, Dict, List

from .base import (
    GenerationRequest,
    GenerationResult,
    ProviderAdapter,
    ProviderError,
)

BEDROCK_IMAGE_URL = "https://bedrock-runtime.{region}.amazonaws.com/model/{model}/invoke"


class AmazonProvider(ProviderAdapter):
    alias = "amazon"
    provider_key = "amazon"

    @classmethod
    def _env_names(cls) -> List[str]:
        return ["AWS_ACCESS_KEY_ID", "NOVA_CANVAS_API_KEY", "BEDROCK_API_KEY"]

    def __init__(self, api_key: str | None = None, region: str = "us-east-1", **kwargs: Any):
        super().__init__(api_key, **kwargs)
        import os
        self.region = region or os.getenv("AWS_REGION") or os.getenv("BEDROCK_REGION") or "us-east-1"
        self.secret_key = os.getenv("AWS_SECRET_ACCESS_KEY", "")

    def generate_image(self, model: str, req: GenerationRequest) -> GenerationResult:
        self.require_configured()
        import httpx

        started = time.time()
        # Bedrock Nova Canvas payload
        payload: Dict[str, Any] = {
            "taskType": "TEXT_IMAGE",
            "textToImageParams": {"text": req.prompt},
            "imageGenerationConfig": {
                "width": req.width,
                "height": req.height,
                "quality": "premium",
                "numberOfImages": 1,
            },
        }
        if req.negative_prompt:
            payload["textToImageParams"]["negativeText"] = req.negative_prompt
        if req.reference_images:
            payload["taskType"] = "IMAGE_VARIATION"
            payload["imageVariationParams"] = {
                "images": req.reference_images,
                "text": req.prompt,
            }

        url = BEDROCK_IMAGE_URL.format(region=self.region, model=model)
        # 注意：正式生产需用 SigV4 签名；此处 P0 用 Bearer（网关代理模式）
        try:
            resp = httpx.post(
                url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "X-Amz-Target": "AmazonNovaCanvasService.InvokeModel",
                },
                timeout=60.0,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise ProviderError(f"Bedrock Nova Canvas HTTP {e.response.status_code}: {e.response.text[:300]}") from e
        except httpx.HTTPError as e:
            raise ProviderError(f"Bedrock Nova Canvas 网络错误: {e}") from e

        data = resp.json()
        images = data.get("images", [])
        if not images:
            raise ProviderError(f"Nova Canvas 无输出: {data}")

        return GenerationResult(
            provider=self.provider_key,
            model=model,
            output_type="image",
            outputs=images,  # base64 列表
            latency_ms=self._elapsed_ms(started),
            raw={"artifacts_count": len(images)},
        )
