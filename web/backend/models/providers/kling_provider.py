# -*- coding: utf-8 -*-
# file: backend/models/providers/kling_provider.py
# 作用：快手可灵（Kling）适配器 — JWT 签名 + 视频生成
import time
import base64
import hmac
import hashlib
import json
from typing import Any, Dict, List

from .base import (
    GenerationRequest,
    GenerationResult,
    ProviderAdapter,
    ProviderError,
)

KLING_TOKEN_URL = "https://api-beijing.klingai.com/v1/token"
KLING_VIDEO_URL = "https://api-beijing.klingai.com/v1/videos/text2video"
KLING_VIDEO_DETAIL_URL = "https://api-beijing.klingai.com/v1/videos/text2video/{task_id}"

_KLING_TERMINAL_FAIL = {"failed", "error"}


def _make_kling_jwt(ak: str, sk: str) -> str:
    """生成 Kling API JWT（HS256）"""
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "iss": ak,
        "exp": now + 1800,
        "nbf": now - 5,
    }

    def b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    signing_input = f"{b64url(json.dumps(header, separators=(',', ':')).encode())}.{b64url(json.dumps(payload, separators=(',', ':')).encode())}"
    signature = hmac.new(sk.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{b64url(signature)}"


class KlingProvider(ProviderAdapter):
    alias = "kuaishou"
    provider_key = "kuaishou"

    @classmethod
    def _env_names(cls) -> List[str]:
        return ["KLING_API_KEY", "KLING_ACCESS_KEY", "KLING_AK"]

    def __init__(self, api_key: str | None = None, secret_key: str | None = None, **kwargs: Any):
        super().__init__(api_key, **kwargs)
        import os
        self.secret_key = secret_key or os.getenv("KLING_SECRET_KEY") or os.getenv("KLING_SK") or ""

    def generate_image(self, model: str, req: GenerationRequest) -> GenerationResult:
        raise ProviderError("Kling 当前仅开放视频生成，图像请路由到其他供应商")

    def generate_video(self, model: str, req: GenerationRequest) -> GenerationResult:
        self.require_configured()
        import httpx

        started = time.time()
        if self.secret_key:
            token = _make_kling_jwt(self.api_key, self.secret_key)
            auth = f"Bearer {token}"
        else:
            auth = f"Bearer {self.api_key}"

        payload: Dict[str, Any] = {
            "model_name": model,
            "prompt": req.prompt,
            "duration": str(int(req.duration_s)),
            "cfg_scale": 0.5,
        }
        if req.negative_prompt:
            payload["negative_prompt"] = req.negative_prompt

        try:
            resp = httpx.post(
                KLING_VIDEO_URL,
                json=payload,
                headers={"Authorization": auth, "Content-Type": "application/json"},
                timeout=30.0,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise ProviderError(f"Kling 视频 HTTP {e.response.status_code}: {e.response.text[:300]}") from e
        except httpx.HTTPError as e:
            raise ProviderError(f"Kling 视频网络错误: {e}") from e

        data = resp.json()
        task_id = data.get("data", {}).get("task_id", "")
        if not task_id:
            raise ProviderError(f"Kling 视频任务无 id: {data}")

        return GenerationResult(
            provider=self.provider_key,
            model=model,
            output_type="video",
            outputs=[],
            latency_ms=self._elapsed_ms(started),
            raw={"task_id": task_id, "status": data.get("data", {}).get("task_status", "submitted")},
        )

    def _kling_auth_header(self) -> str:
        if self.secret_key:
            token = _make_kling_jwt(self.api_key, self.secret_key)
            return f"Bearer {token}"
        return f"Bearer {self.api_key}"

    def poll_video_task(self, model: str, task_id: str) -> GenerationResult:
        """轮询 Kling 视频任务。终态返回 outputs=[视频 URL]；失败抛 ProviderError。"""
        self.require_configured()
        import httpx

        started = time.time()
        url = KLING_VIDEO_DETAIL_URL.format(task_id=task_id)
        try:
            resp = httpx.get(
                url,
                headers={"Authorization": self._kling_auth_header()},
                timeout=30.0,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise ProviderError(f"Kling 轮询 HTTP {e.response.status_code}: {e.response.text[:300]}") from e
        except httpx.HTTPError as e:
            raise ProviderError(f"Kling 轮询网络错误: {e}") from e

        data = resp.json().get("data", {})
        status = data.get("task_status", "submitted")
        videos = (data.get("task_result") or {}).get("videos") or []
        outputs = [v["url"] for v in videos if v.get("url")]

        if status in _KLING_TERMINAL_FAIL:
            raise ProviderError(f"Kling 视频任务失败: {task_id} status={status}")

        return GenerationResult(
            provider=self.provider_key,
            model=model,
            output_type="video",
            outputs=outputs,
            latency_ms=self._elapsed_ms(started),
            raw={"task_id": task_id, "status": status},
        )
