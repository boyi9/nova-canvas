# -*- coding: utf-8 -*-
# file: backend/models/generation_gateway.py
# 作用：P0-6 生成网关 — 路由 + 供应商调用 + 网关重试 + 留痕
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from web.backend.models.model_router import RouteRequest, RouteResult, route, NoCandidateError
from web.backend.models.providers import (
    GenerationRequest,
    GenerationResult,
    ProviderError,
    ProviderNotConfiguredError,
    provider_for_model,
)
from web.backend.services.gateway_retry import GatewayRetryOwner, RetryPolicy, RetryBudgetExhaustedError, DeadlineExceededError
from web.backend.services.async_job import AsyncJobManager, JobStatus, get_manager
from web.backend.models.call_trace import get_store


class GenerationGatewayError(RuntimeError):
    pass


# 不同任务类型的重试 deadline（视频任务允许更长）
TASK_RETRY_POLICY: Dict[str, RetryPolicy] = {
    "image": RetryPolicy(max_retries=2, base_delay_s=0.5, deadline_ms=8000, min_attempt_ms=500),
    "video": RetryPolicy(max_retries=1, base_delay_s=2.0, deadline_ms=30000, min_attempt_ms=1000),
    "text": RetryPolicy(max_retries=2, base_delay_s=0.3, deadline_ms=8000, min_attempt_ms=300),
}

DEFAULT_RETRY_POLICY = RetryPolicy(deadline_ms=8000)


@dataclass
class GenerationCallResult:
    """一次完整生成调用的结果（含路由与留痕）"""
    generation: GenerationResult
    route_result: RouteResult
    trace_id: str = ""
    stats: Dict[str, Any] = field(default_factory=dict)


@dataclass
class VideoTaskRef:
    """异步视频任务引用（provider 任务号 → 供应商/模型）。"""

    provider_key: str
    model: str
    alias: str = ""


class GenerationGateway:
    """
    生成网关主入口。
    1. 路由（硬约束+软评分）选模型
    2. 按模型名解析供应商适配器
    3. GatewayRetryOwner 统一持有重试（SDK 重试=0）
    4. CallTraceStore 落 13 字段留痕
    5. 异步视频任务：submit + poll（接入 AsyncJobManager 三层补偿）
    """

    def __init__(
        self,
        retry_policies: Optional[Dict[str, RetryPolicy]] = None,
        trace_store: Optional[Any] = None,
        job_manager: Optional[AsyncJobManager] = None,
    ):
        self.retry_policies = retry_policies or TASK_RETRY_POLICY
        self.trace_store = trace_store or get_store()
        self.job_manager = job_manager or get_manager()
        self._video_tasks: Dict[str, VideoTaskRef] = {}
        if self.job_manager.poller_fn is None:
            self.job_manager.poller_fn = self._poll_video_task

    def _policy_for(self, kind: str) -> RetryPolicy:
        return self.retry_policies.get(kind, DEFAULT_RETRY_POLICY)

    def generate(
        self,
        route_req: RouteRequest,
        gen_req: GenerationRequest,
        *,
        kind: str = "image",
        task_id: str = "",
        step_id: str = "",
        input_type: str = "I1",
        operation: str = "create",
        control_mode: str = "M0",
        human_confirm: bool = False,
    ) -> GenerationCallResult:
        # 1) 路由
        route_result = route(route_req)

        # 2) 供应商
        provider = provider_for_model(route_result.selected.model, route_result.selected.alias)

        # 3) 网关重试包裹调用
        owner = GatewayRetryOwner(self._policy_for(kind))

        def _call() -> GenerationResult:
            if kind == "video":
                return provider.generate_video(route_result.selected.model, gen_req)
            return provider.generate_image(route_result.selected.model, gen_req)

        try:
            generation = owner.execute(_call)
        except (RetryBudgetExhaustedError, DeadlineExceededError) as e:
            # 失败也留痕
            trace_id = self._record_trace(
                route_result, kind, task_id, step_id, input_type,
                operation, control_mode, human_confirm,
                output=None, latency_ms=0.0, cost_cny=0.0, error=str(e),
            )
            raise GenerationGatewayError(
                f"模型调用失败(alias={route_result.selected.alias}): {e}"
            ) from e

        # 4) 留痕
        trace_id = self._record_trace(
            route_result, kind, task_id, step_id, input_type,
            operation, control_mode, human_confirm,
            output=generation.outputs or generation.raw,
            latency_ms=generation.latency_ms,
            cost_cny=route_result.selected.unit_cost_cny,
        )

        return GenerationCallResult(
            generation=generation,
            route_result=route_result,
            trace_id=trace_id,
            stats={
                "provider": provider.provider_key,
                "alias": route_result.selected.alias,
                "model": route_result.selected.model,
                "unit_cost_cny": route_result.selected.unit_cost_cny,
            },
        )

    def _record_trace(
        self,
        route_result: RouteResult,
        kind: str,
        task_id: str,
        step_id: str,
        input_type: str,
        operation: str,
        control_mode: str,
        human_confirm: bool,
        output: Any,
        latency_ms: float,
        cost_cny: float,
        error: str = "",
    ) -> str:
        try:
            trace = self.trace_store.record_call(
                task_id=task_id or f"auto-{int(time.time() * 1000)}",
                step_id=step_id or "step-0",
                input_type=input_type,
                operation=operation,
                control_mode=control_mode,
                model_alias=route_result.selected.alias,
                route_reason=route_result.route_reason,
                cost_cny=cost_cny,
                latency_ms=latency_ms,
                human_confirm=human_confirm,
                output=output if output is not None else {"error": error},
                model_version=route_result.selected.model,
            )
            return trace.output_hash
        except Exception:
            return ""

    # ---- 异步视频任务（submit + poll + 三层补偿）----

    def submit_video(
        self,
        route_req: RouteRequest,
        gen_req: GenerationRequest,
        *,
        task_id: str = "",
        step_id: str = "",
        control_mode: str = "M0",
        human_confirm: bool = False,
    ) -> Dict[str, Any]:
        """提交异步视频任务，返回 provider 任务号（注册到 AsyncJobManager）。"""
        call = self.generate(
            route_req,
            gen_req,
            kind="video",
            task_id=task_id,
            step_id=step_id,
            control_mode=control_mode,
            human_confirm=human_confirm,
        )
        provider_task_id = str(call.generation.raw.get("task_id", ""))
        if not provider_task_id:
            raise GenerationGatewayError("供应商未返回视频任务号，无法进入异步轮询")

        self._video_tasks[provider_task_id] = VideoTaskRef(
            provider_key=call.stats.get("provider", ""),
            model=call.route_result.selected.model,
            alias=call.route_result.selected.alias,
        )
        self.job_manager.create_job(provider_task_id)
        return {
            "task_id": provider_task_id,
            "provider": call.stats.get("provider", ""),
            "model": call.route_result.selected.model,
            "alias": call.route_result.selected.alias,
            "status": str(call.generation.raw.get("status", "submitted")),
            "trace_id": call.trace_id,
        }

    def _poll_video_task(self, provider_task_id: str) -> GenerationResult:
        ref = self._video_tasks.get(provider_task_id)
        if ref is None:
            raise GenerationGatewayError(f"未知视频任务: {provider_task_id}")
        provider = provider_for_model(ref.model, ref.alias)
        return provider.poll_video_task(ref.model, provider_task_id)

    def poll_video(self, provider_task_id: str) -> Dict[str, Any]:
        """轮询视频任务。终态回写 AsyncJobManager（幂等）。"""
        job = self.job_manager.get_job(provider_task_id)
        if job is not None and job.status in (JobStatus.COMPLETED, JobStatus.FAILED):
            return {
                "task_id": provider_task_id,
                "status": job.status.value,
                "outputs": (job.result.outputs if isinstance(job.result, GenerationResult) else []),
                "raw": (job.result.raw if isinstance(job.result, GenerationResult) else {}),
            }

        try:
            generation = self._poll_video_task(provider_task_id)
        except ProviderError as e:
            if job is not None:
                self.job_manager.receive_callback(provider_task_id, error=str(e))
            raise

        status = str(generation.raw.get("status", "unknown"))
        terminal = bool(generation.outputs) or status in ("succeed", "success", "completed", "failed")
        if terminal and job is not None:
            self.job_manager.receive_callback(provider_task_id, result=generation)

        return {
            "task_id": provider_task_id,
            "status": status if not terminal else (
                "completed" if generation.outputs else status
            ),
            "outputs": generation.outputs,
            "raw": generation.raw,
            "compensated": bool(job.compensated) if job else False,
        }


# 全局单例
_gateway: Optional[GenerationGateway] = None


def get_gateway() -> GenerationGateway:
    global _gateway
    if _gateway is None:
        _gateway = GenerationGateway()
    return _gateway


def reset_gateway() -> None:
    global _gateway
    _gateway = None
