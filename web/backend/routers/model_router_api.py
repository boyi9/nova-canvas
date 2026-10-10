# -*- coding: utf-8 -*-
# file: backend/routers/model_router_api.py
# 作用：P0-6 模型路由与生成 API
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from web.backend.models.catalog import get_catalog, CatalogError
from web.backend.models.model_router import RouteRequest, NoCandidateError, route
from web.backend.models.generation_gateway import (
    GenerationGatewayError,
    get_gateway,
)
from web.backend.models.providers import (
    GenerationRequest,
    ProviderError,
    ProviderNotConfiguredError,
    health_report,
)
from web.backend.models.call_trace import get_store

router = APIRouter(prefix="/api/model", tags=["model-router"])


class RouteIn(BaseModel):
    required_capabilities: List[str]
    task_type: str = "default"
    user_region: str = "cn"
    target_resolution: Optional[Tuple[int, int]] = None
    target_duration_s: Optional[float] = None
    required_context_tokens: Optional[int] = None
    max_cost_cny: Optional[float] = None


class GenerateIn(RouteIn):
    prompt: str = ""
    negative_prompt: str = ""
    width: int = 1024
    height: int = 1024
    duration_s: float = 5.0
    reference_images: List[str] = Field(default_factory=list)
    kind: str = "image"  # image | video
    task_id: str = ""
    step_id: str = ""
    control_mode: str = "M0"
    human_confirm: bool = False


class VideoSubmitIn(GenerateIn):
    kind: str = "video"


@router.get("/catalog", summary="模型能力目录摘要")
def get_catalog_summary() -> Dict[str, Any]:
    try:
        return get_catalog().summary()
    except CatalogError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/route", summary="两步路由（硬约束+软评分）")
def do_route(req: RouteIn) -> Dict[str, Any]:
    route_req = RouteRequest(
        required_capabilities=req.required_capabilities,
        task_type=req.task_type,
        user_region=req.user_region,
        target_resolution=req.target_resolution,
        target_duration_s=req.target_duration_s,
        required_context_tokens=req.required_context_tokens,
        max_cost_cny=req.max_cost_cny,
    )
    try:
        result = route(route_req)
    except NoCandidateError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {
        "selected_alias": result.selected.alias,
        "model": result.selected.model,
        "score": result.score,
        "score_breakdown": result.score_breakdown,
        "candidates_considered": result.candidates_considered,
        "route_reason": result.route_reason,
    }


@router.post("/generate", summary="路由 + 生成（含重试与留痕）")
def do_generate(req: GenerateIn) -> Dict[str, Any]:
    route_req = RouteRequest(
        required_capabilities=req.required_capabilities,
        task_type=req.task_type,
        user_region=req.user_region,
        target_resolution=req.target_resolution,
        target_duration_s=req.target_duration_s,
        required_context_tokens=req.required_context_tokens,
        max_cost_cny=req.max_cost_cny,
    )
    gen_req = GenerationRequest(
        prompt=req.prompt,
        negative_prompt=req.negative_prompt,
        width=req.width,
        height=req.height,
        duration_s=req.duration_s,
        reference_images=req.reference_images,
    )
    gateway = get_gateway()
    try:
        result = gateway.generate(
            route_req,
            gen_req,
            kind=req.kind,
            task_id=req.task_id,
            step_id=req.step_id,
            control_mode=req.control_mode,
            human_confirm=req.human_confirm,
        )
    except NoCandidateError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ProviderNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=f"模型供应商未配置: {e}")
    except GenerationGatewayError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except ProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {
        "success": True,
        "selected_alias": result.route_result.selected.alias,
        "model": result.route_result.selected.model,
        "score": result.route_result.score,
        "outputs": result.generation.outputs,
        "output_type": result.generation.output_type,
        "latency_ms": result.generation.latency_ms,
        "unit_cost_cny": result.stats.get("unit_cost_cny", 0.0),
        "provider": result.stats.get("provider", ""),
        "trace_id": result.trace_id,
        "raw": result.generation.raw,
    }


@router.get("/providers", summary="供应商健康检查")
def providers_health() -> Dict[str, Any]:
    return health_report()


@router.post("/video/submit", summary="提交异步视频任务（返回任务号）")
def submit_video_task(req: VideoSubmitIn) -> Dict[str, Any]:
    route_req = RouteRequest(
        required_capabilities=req.required_capabilities,
        task_type=req.task_type,
        user_region=req.user_region,
        target_resolution=req.target_resolution,
        target_duration_s=req.target_duration_s,
        required_context_tokens=req.required_context_tokens,
        max_cost_cny=req.max_cost_cny,
    )
    gen_req = GenerationRequest(
        prompt=req.prompt,
        negative_prompt=req.negative_prompt,
        width=req.width,
        height=req.height,
        duration_s=req.duration_s,
        reference_images=req.reference_images,
    )
    gateway = get_gateway()
    try:
        return gateway.submit_video(
            route_req,
            gen_req,
            task_id=req.task_id,
            step_id=req.step_id,
            control_mode=req.control_mode,
            human_confirm=req.human_confirm,
        )
    except NoCandidateError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ProviderNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=f"模型供应商未配置: {e}")
    except GenerationGatewayError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except ProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/video/{task_id:path}", summary="轮询视频任务状态")
def poll_video_task(task_id: str) -> Dict[str, Any]:
    gateway = get_gateway()
    try:
        return gateway.poll_video(task_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=f"任务不存在: {e}")
    except GenerationGatewayError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/traces", summary="最近调用留痕")
def recent_traces(limit: int = 20) -> Dict[str, Any]:
    store = get_store()
    return {
        "traces": [t.to_dict() for t in store.recent(limit)],
        "completeness_rate": store.completeness_rate(),
        "total_cost_cny": store.total_cost(),
    }
