# -*- coding: utf-8 -*-
# file: tests/test_provider_polling.py
# 作用：P1-5 供应商异步轮询 —— base 默认 / kling 映射 / gateway submit+poll+补偿
import pytest
from unittest.mock import patch

from web.backend.models.catalog import ModelCatalog, ModelEntry
from web.backend.models.generation_gateway import GenerationGateway, GenerationGatewayError
from web.backend.models.model_router import RouteResult, RouteRequest
from web.backend.models.providers import GenerationRequest, GenerationResult, ProviderError
from web.backend.models.providers.base import ProviderAdapter
from web.backend.models.providers.kling_provider import KlingProvider
from web.backend.services.async_job import AsyncJobManager, JobStatus
from web.backend.services.gateway_retry import RetryPolicy
from web.backend.models.call_trace import CallTraceStore


class FakeVideoProvider(ProviderAdapter):
    alias = "fake"
    provider_key = "fake"

    @classmethod
    def _env_names(cls):
        return ["FAKE_KEY"]

    def __init__(self, api_key="fake-key"):
        super().__init__(api_key)
        self.poll_calls = 0
        self._states = ["submitted", "processing", "succeed"]

    def generate_image(self, model, req):
        raise ProviderError("no image")

    def generate_video(self, model, req):
        return GenerationResult(
            provider=self.provider_key,
            model=model,
            output_type="video",
            outputs=[],
            raw={"task_id": "fake-task-001", "status": "submitted"},
        )

    def poll_video_task(self, model, task_id):
        self.poll_calls += 1
        state = self._states[min(self.poll_calls - 1, len(self._states) - 1)]
        outputs = ["http://cdn.example.com/out.mp4"] if state == "succeed" else []
        return GenerationResult(
            provider=self.provider_key,
            model=model,
            output_type="video",
            outputs=outputs,
            raw={"task_id": task_id, "status": state},
        )


def _catalog():
    return ModelCatalog(
        [
            ModelEntry(
                alias="video-gen-primary",
                model="volcengine/seedance-2.5",
                capabilities=["video_gen", "image_to_video"],
                regions=["cn"],
                license="commercial",
                unit_cost_cny=0.45,
                max_latency_s=300,
                max_duration_s=60,
                quality=0.9,
                availability=0.96,
            )
        ]
    )


def _gateway(fake: FakeVideoProvider):
    policies = {"video": RetryPolicy(max_retries=0, base_delay_s=0.01, deadline_ms=2000, min_attempt_ms=5)}
    manager = AsyncJobManager(callback_timeout_s=30.0)
    gw = GenerationGateway(
        retry_policies=policies,
        trace_store=CallTraceStore(),
        job_manager=manager,
    )
    return gw


def _route_result(catalog):
    entry = catalog.get("video-gen-primary")
    return RouteResult(selected=entry, score=0.9, score_breakdown={}, candidates_considered=1, route_reason="test")


class TestProviderPollDefaults:
    def test_base_provider_rejects_poll(self):
        class MinProvider(ProviderAdapter):
            alias = "min"
            provider_key = "min"

            @classmethod
            def _env_names(cls):
                return ["MIN_KEY"]

            def generate_image(self, model, req):
                raise ProviderError("no")

        p = MinProvider(api_key="k")
        with pytest.raises(ProviderError):
            p.poll_video_task("m", "t")

    def test_kling_poll_maps_success(self):
        p = KlingProvider(api_key="ak", secret_key="sk")
        mock_resp = type("R", (), {})()
        mock_resp.status_code = 200
        mock_resp.text = "{}"
        mock_resp.json = lambda: {
            "data": {
                "task_status": "succeed",
                "task_result": {"videos": [{"url": "http://cdn.example.com/k.mp4"}]},
            }
        }
        mock_resp.raise_for_status = lambda: None
        with patch("httpx.get", return_value=mock_resp):
            result = p.poll_video_task("kuaishou/kling-3.0", "kt-1")
        assert result.outputs == ["http://cdn.example.com/k.mp4"]
        assert result.raw["status"] == "succeed"

    def test_kling_poll_maps_failure(self):
        p = KlingProvider(api_key="ak", secret_key="sk")
        mock_resp = type("R", (), {})()
        mock_resp.status_code = 200
        mock_resp.text = "{}"
        mock_resp.json = lambda: {"data": {"task_status": "failed"}}
        mock_resp.raise_for_status = lambda: None
        with patch("httpx.get", return_value=mock_resp):
            with pytest.raises(ProviderError):
                p.poll_video_task("kuaishou/kling-3.0", "kt-2")


class TestGatewayVideoFlow:
    def setup_method(self):
        self.fake = FakeVideoProvider()
        self.catalog = _catalog()
        self.gw = _gateway(self.fake)

    def test_submit_registers_job(self):
        with patch("web.backend.models.generation_gateway.route", return_value=_route_result(self.catalog)), \
             patch("web.backend.models.generation_gateway.provider_for_model", return_value=self.fake):
            info = self.gw.submit_video(
                RouteRequest(required_capabilities=["video_gen"]),
                GenerationRequest(prompt="测试视频", duration_s=5),
            )
        assert info["task_id"] == "fake-task-001"
        job = self.gw.job_manager.get_job("fake-task-001")
        assert job is not None
        assert job.status == JobStatus.PENDING

    def test_poll_progresses_to_terminal(self):
        with patch("web.backend.models.generation_gateway.route", return_value=_route_result(self.catalog)), \
             patch("web.backend.models.generation_gateway.provider_for_model", return_value=self.fake):
            self.gw.submit_video(
                RouteRequest(required_capabilities=["video_gen"]),
                GenerationRequest(prompt="x"),
            )
            r1 = self.gw.poll_video("fake-task-001")
            assert r1["status"] == "submitted"
            r2 = self.gw.poll_video("fake-task-001")
            assert r2["status"] == "processing"
            r3 = self.gw.poll_video("fake-task-001")
            assert r3["status"] == "completed"
            assert r3["outputs"] == ["http://cdn.example.com/out.mp4"]

        job = self.gw.job_manager.get_job("fake-task-001")
        assert job.status == JobStatus.COMPLETED

    def test_compensation_uses_poller(self):
        with patch("web.backend.models.generation_gateway.route", return_value=_route_result(self.catalog)), \
             patch("web.backend.models.generation_gateway.provider_for_model", return_value=self.fake):
            self.gw.submit_video(
                RouteRequest(required_capabilities=["video_gen"]),
                GenerationRequest(prompt="x"),
            )
            # 超时补偿：直接调用 manager 补偿（poller_fn 已接 gateway）
            compensated = self.gw.job_manager.run_compensation_pass()
            # 30s 超时未到，不应补偿
            assert compensated == []
            # 强制过期
            self.gw.job_manager.callback_timeout_s = 0.0
            compensated = self.gw.job_manager.run_compensation_pass()
            assert "fake-task-001" in compensated
            job = self.gw.job_manager.get_job("fake-task-001")
            assert job.compensated is True

    def test_poll_unknown_task_raises(self):
        with pytest.raises(GenerationGatewayError):
            self.gw.poll_video("nope")
