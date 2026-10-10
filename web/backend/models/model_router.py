# -*- coding: utf-8 -*-
# file: backend/models/model_router.py
# 作用：NC-CAP-04 两步路由：硬约束过滤 + 软评分
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from web.backend.models.catalog import ModelCatalog, ModelEntry, get_catalog


class NoCandidateError(RuntimeError):
    """无候选模型：抛错，不得降级将就"""
    pass


# 任务类型 → 软评分权重 (quality, availability, latency, cost)
TASK_WEIGHTS: Dict[str, Dict[str, float]] = {
    "brand_keyvisual": {"quality": 0.50, "availability": 0.20, "latency": 0.10, "cost": 0.20},
    "batch_fission": {"quality": 0.25, "availability": 0.20, "latency": 0.15, "cost": 0.40},
    "realtime_preview": {"quality": 0.25, "availability": 0.25, "latency": 0.35, "cost": 0.15},
}

DEFAULT_WEIGHTS = {"quality": 0.40, "availability": 0.25, "latency": 0.20, "cost": 0.15}


@dataclass
class RouteRequest:
    """路由请求"""
    required_capabilities: List[str]
    task_type: str = "default"
    user_region: str = "cn"
    target_resolution: Optional[Tuple[int, int]] = None  # (w, h)
    target_duration_s: Optional[float] = None
    required_context_tokens: Optional[int] = None
    max_cost_cny: Optional[float] = None


@dataclass
class ScoredModel:
    """带评分的候选模型"""
    entry: ModelEntry
    score: float
    score_breakdown: Dict[str, float] = field(default_factory=dict)


@dataclass
class RouteResult:
    """路由结果"""
    selected: ModelEntry
    score: float
    score_breakdown: Dict[str, float]
    candidates_considered: int
    route_reason: str


def hard_filter(
    catalog: ModelCatalog,
    req: RouteRequest,
) -> List[ModelEntry]:
    """
    第一步·硬约束过滤：
    - capabilities 必须包含所需全部能力
    - max_resolution ≥ 目标分辨率
    - max_duration_s ≥ 目标时长
    - context_window ≥ 所需 token
    - regions 含用户数据域
    - license 合规（production_candidates）
    """
    candidates = catalog.production_candidates()
    passed: List[ModelEntry] = []

    for e in candidates:
        # capabilities 全含
        if not set(req.required_capabilities).issubset(set(e.capabilities)):
            continue
        # region 命中
        if req.user_region not in e.regions:
            continue
        # 分辨率
        if req.target_resolution and e.max_resolution:
            tw, th = req.target_resolution
            mw, mh = e.max_resolution
            if tw > mw or th > mh:
                continue
        # 时长
        if req.target_duration_s is not None and e.max_duration_s is not None:
            if req.target_duration_s > e.max_duration_s:
                continue
        # 上下文
        if req.required_context_tokens is not None and e.context_window is not None:
            if req.required_context_tokens > e.context_window:
                continue
        # 成本上限
        if req.max_cost_cny is not None and e.unit_cost_cny > req.max_cost_cny:
            continue

        passed.append(e)

    return passed


def score_model(entry: ModelEntry, task_type: str = "default") -> ScoredModel:
    """
    第二步·软评分：
    score = w_q × quality + w_a × availability + w_l × (1 - normalized_latency) + w_c × (1 - normalized_cost)
    """
    weights = TASK_WEIGHTS.get(task_type, DEFAULT_WEIGHTS)

    # latency 归一化：越低越好，用 1/(1+latency/60) 映射到 (0,1]
    lat_norm = 1.0 / (1.0 + entry.max_latency_s / 60.0)
    # cost 归一化：越低越好，用 1/(1+cost) 映射
    cost_norm = 1.0 / (1.0 + entry.unit_cost_cny)

    score = (
        weights["quality"] * entry.quality
        + weights["availability"] * entry.availability
        + weights["latency"] * lat_norm
        + weights["cost"] * cost_norm
    )

    return ScoredModel(
        entry=entry,
        score=round(score, 6),
        score_breakdown={
            "quality": round(weights["quality"] * entry.quality, 6),
            "availability": round(weights["availability"] * entry.availability, 6),
            "latency": round(weights["latency"] * lat_norm, 6),
            "cost": round(weights["cost"] * cost_norm, 6),
        },
    )


def route(
    req: RouteRequest,
    catalog: Optional[ModelCatalog] = None,
) -> RouteResult:
    """
    两步路由主入口。
    - 硬约束过滤后无候选 → 抛 NoCandidateError
    - 软评分排序取最高分
    - 记录 route_reason 供留痕
    """
    if catalog is None:
        catalog = get_catalog()

    # 第一步：硬约束
    candidates = hard_filter(catalog, req)

    if not candidates:
        raise NoCandidateError(
            f"无满足条件的模型: caps={req.required_capabilities}, "
            f"region={req.user_region}, task={req.task_type}"
        )

    # 第二步：软评分
    scored = [score_model(e, req.task_type) for e in candidates]
    scored.sort(key=lambda s: s.score, reverse=True)
    best = scored[0]

    # 构建留痕原因
    passed_checks = []
    passed_checks.append(f"capabilities={req.required_capabilities}")
    passed_checks.append(f"region={req.user_region}")
    if req.target_resolution:
        passed_checks.append(f"resolution<={req.target_resolution}")
    if req.target_duration_s:
        passed_checks.append(f"duration<={req.target_duration_s}")

    route_reason = (
        f"硬约束通过({len(candidates)}候选); "
        f"软评分task={req.task_type}; "
        f"selected={best.entry.alias}; "
        f"score={best.score}; "
        f"breakdown={best.score_breakdown}"
    )

    return RouteResult(
        selected=best.entry,
        score=best.score,
        score_breakdown=best.score_breakdown,
        candidates_considered=len(candidates),
        route_reason=route_reason,
    )
