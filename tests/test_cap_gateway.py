# -*- coding: utf-8 -*-
# file: tests/test_cap_gateway.py
# 作用：P0-6 生成网关 + 供应商注册表测试
import pytest
from unittest.mock import patch, MagicMock

from web.backend.models.catalog import ModelCatalog, ModelEntry
from web.backend.models.model_router import RouteRequest, NoCandidateError
from web.backend.models.generation_gateway import (
    GenerationGateway,
    GenerationGatewayError,
    TASK_RETRY_POLICY,
)
from web.backend.models.providers import (
    GenerationRequest,
    GenerationResult,
    ProviderError,
    ProviderNotConfiguredError,
    provider_for_model,
    reset_providers,
)
from web.backend.models.providers.registry import _ALIAS_MAP, _MODEL_PREFIX_MAP
from web.backend.models.providers.volcengine_provider import VolcengineProvider
from web.backend.models.providers.aliyun_provider import AliyunProvider
from web.backend.models.providers.kling_provider import KlingProvider
from web.backend.models.providers.amazon_provider import AmazonProvider
from web.backend.services.gateway_retry import RetryPolicy
from web.backend.models.call_trace import CallTraceStore


def make_catalog():
    entries = [
        ModelEntry(
            alias="image-edit-primary", model="doubao/seedream-5.0-pro",
            capabilities=["image_gen", "image_edit"], regions=["cn"],
            license="commercial", unit_cost_cny=0.12, max_latency_s=30,
            quality=0.92, availability=0.98,
        ),
        ModelEntry(
            alias="video-gen-primary", model="volcengine/seedance-2.5",
            capabilities=["video_gen", "image_to_video"], regions=["cn"],
            license="commercial", unit_cost_cny=0.45, max_latency_s=300,
            max_duration_s=60, quality=0.90, availability=0.96,
        ),
    ]
    return ModelCatalog(entries)


# ---- 供应商注册表 ----

class TestProviderRegistry:
    def setup_method(self):
        reset_providers()

    def test_doubao_prefix_resolves_volcengine(self):
        p = provider_for_model("doubao/seedream-5.0-pro")
        assert isinstance(p, VolcengineProvider)

    def test_aliyun_prefix_resolves_aliyun(self):
        p = provider_for_model("aliyun/qwen-image-3.0")
        assert isinstance(p, AliyunProvider)

    def test_kuaishou_prefix_resolves_kling(self):
        p = provider_for_model("kuaishou/kling-3.0")
        assert isinstance(p, KlingProvider)

    def test_amazon_prefix_resolves_amazon(self):
        p = provider_for_model("amazon/nova-canvas-pro")
        assert isinstance(p, AmazonProvider)

    def test_alias_fallback_resolves(self):
        p = provider_for_model("unknown-model", alias="image-edit-primary")
        assert isinstance(p, VolcengineProvider)

    def test_unknown_model_raises(self):
        with pytest.raises(ProviderError):
            provider_for_model("totally/unknown-xyz", alias="nonexistent")

    def test_prefix_map_covers_catalog_models(self):
        # models_catalog.yaml 中所有商业模型都能被前缀表命中
        catalog_models = [
            "doubao/seedream-5.0-pro", "aliyun/qwen-image-3.0",
            "volcengine/seedance-2.5", "kuaishou/kling-3.0",
            "aliyun/qwen3-max", "doubao/seedream-4.0",
            "amazon/nova-canvas-pro", "runway/gen-4",
        ]
        for m in catalog_models:
            matched = any(m.startswith(p) or p in m for p in _MODEL_PREFIX_MAP)
            # runway 未单独建适配器，走 volc 兜底或 alias 表
            if not matched:
                assert m in ("runway/gen-4",), f"模型 {m} 未被前缀表覆盖"

    def test_alias_map_covers_all_aliases(self):
        expected = {
            "image-edit-primary", "image-edit-fallback", "video-gen-primary",
            "video-edit-audio-sync", "llm-orchestrator", "batch-fission-budget",
            "brand-keyvisual-premium", "overseas-video",
        }
        assert expected == set(_ALIAS_MAP.keys())

    def test_not_configured_raises(self):
        p = VolcengineProvider(api_key="")
        with pytest.raises(ProviderNotConfiguredError):
            p.require_configured()

    def test_configured_with_env(self):
        p = VolcengineProvider(api_key="test-key")
        assert p.configured is True


# ---- 生成网关 ----

class TestGenerationGateway:
    def setup_method(self):
        reset_providers()

    def _gateway(self):
        # 极短重试，加速测试
        policies = {
            "image": RetryPolicy(max_retries=1, base_delay_s=0.01, deadline_ms=2000, min_attempt_ms=10),
            "video": RetryPolicy(max_retries=1, base_delay_s=0.01, deadline_ms=5000, min_attempt_ms=10),
        }
        return GenerationGateway(retry_policies=policies, trace_store=CallTraceStore())

    def test_generate_image_success(self):
        catalog = make_catalog()
        gw = self._gateway()
        mock_result = GenerationResult(
            provider="volcengine", model="doubao/seedream-5.0-pro",
            output_type="image", outputs=["http://example.com/a.png"],
            latency_ms=1200.0,
        )
        with patch("web.backend.models.generation_gateway.route") as mock_route, \
             patch.object(VolcengineProvider, "generate_image", return_value=mock_result) as mock_gen:
            from web.backend.models.model_router import RouteResult
            entry = catalog.get("image-edit-primary")
            mock_route.return_value = RouteResult(
                selected=entry, score=0.9, score_breakdown={},
                candidates_considered=1, route_reason="test",
            )
            result = gw.generate(
                RouteRequest(required_capabilities=["image_gen"]),
                GenerationRequest(prompt="测试"),
                kind="image", task_id="t1", step_id="s1",
            )
            assert result.generation.outputs == ["http://example.com/a.png"]
            assert result.route_result.selected.alias == "image-edit-primary"
            assert result.trace_id != ""
            mock_gen.assert_called_once()

    def test_generate_records_trace_on_failure(self):
        catalog = make_catalog()
        store = CallTraceStore()
        policies = {"image": RetryPolicy(max_retries=0, base_delay_s=0.01, deadline_ms=1000, min_attempt_ms=10)}
        gw = GenerationGateway(retry_policies=policies, trace_store=store)
        with patch("web.backend.models.generation_gateway.route") as mock_route, \
             patch.object(VolcengineProvider, "generate_image", side_effect=ProviderError("boom")):
            from web.backend.models.model_router import RouteResult
            entry = catalog.get("image-edit-primary")
            mock_route.return_value = RouteResult(
                selected=entry, score=0.9, score_breakdown={},
                candidates_considered=1, route_reason="test",
            )
            with pytest.raises(GenerationGatewayError):
                gw.generate(
                    RouteRequest(required_capabilities=["image_gen"]),
                    GenerationRequest(prompt="x"), kind="image",
                )
            # 失败也有留痕
            traces = store.by_task_id("auto-" + store.recent(1)[0].task_id.split("-")[-1]) if store.recent() else []
            assert store.size() >= 1

    def test_generate_no_candidate_raises(self):
        gw = self._gateway()
        with patch("web.backend.models.generation_gateway.route", side_effect=NoCandidateError("none")):
            with pytest.raises(NoCandidateError):
                gw.generate(
                    RouteRequest(required_capabilities=["nonexistent"]),
                    GenerationRequest(prompt="x"), kind="image",
                )

    def test_video_kind_calls_generate_video(self):
        catalog = make_catalog()
        gw = self._gateway()
        mock_result = GenerationResult(
            provider="volcengine", model="volcengine/seedance-2.5",
            output_type="video", outputs=[], latency_ms=5000.0,
            raw={"task_id": "vid-1"},
        )
        with patch("web.backend.models.generation_gateway.route") as mock_route, \
             patch.object(VolcengineProvider, "generate_video", return_value=mock_result) as mock_gen:
            from web.backend.models.model_router import RouteResult
            entry = catalog.get("video-gen-primary")
            mock_route.return_value = RouteResult(
                selected=entry, score=0.9, score_breakdown={},
                candidates_considered=1, route_reason="test",
            )
            result = gw.generate(
                RouteRequest(required_capabilities=["video_gen"]),
                GenerationRequest(prompt="视频", duration_s=10),
                kind="video",
            )
            mock_gen.assert_called_once()
            assert result.generation.raw["task_id"] == "vid-1"

    def test_retry_policies_have_deadlines(self):
        assert TASK_RETRY_POLICY["image"].deadline_ms == 8000
        assert TASK_RETRY_POLICY["video"].deadline_ms >= 20000
        assert TASK_RETRY_POLICY["text"].deadline_ms == 8000
