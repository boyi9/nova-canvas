# -*- coding: utf-8 -*-
# file: backend/retouch/engine_router.py
# 作用：NC-RET-02 修图引擎路由 —— 按算子 + 档位（local/balanced/flagship）选引擎，失败降级
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


class EngineNotAvailableError(RuntimeError):
    """该算子在当前档位/环境下无可用引擎。"""


@dataclass(frozen=True)
class EngineChoice:
    op: str
    tier: str
    engine: str
    cost_cny: float
    local: bool  # True=本地可跑（numpy/PIL 自研栈），False=需外部栈（ComfyUI/PS 等）


# 档位降级链：旗舰 → 均衡 → 本地自研（断网/超预算时流程不中断）
TIER_CHAIN: Dict[str, List[str]] = {
    "flagship": ["flagship", "balanced", "local"],
    "balanced": ["balanced", "local"],
    "local": ["local"],
    "economy": ["local", "balanced"],
}

# 引擎表（config/retouch_engine.yaml 的内联等价物；local 栈为可跑的自研核心）
_ENGINES: Dict[str, Dict[str, Dict[str, Any]]] = {
    "skin_frequency": {
        "local": {"stack": "frequency_separation", "cost": 0.0, "runnable": True},
        "balanced": {"stack": "comfy_skin_freq", "cost": 0.012, "runnable": False, "gpu": "T4"},
        "flagship": {"stack": "comfy_skin_freq_4k+PS_highlow", "cost": 0.05, "runnable": False},
    },
    "blemish": {
        "local": {"stack": "frequency_blemish", "cost": 0.0, "runnable": True},
        "balanced": {"stack": "comfy_blemish", "cost": 0.010, "runnable": False, "gpu": "T4"},
        "flagship": {"stack": "comfy_blemish_4k", "cost": 0.045, "runnable": False},
    },
    "tone_unify": {
        "balanced": {"stack": "comfy_tone_unify", "cost": 0.012, "runnable": False, "gpu": "T4"},
    },
    "liquify": {
        "balanced": {"stack": "photoshop_python_api", "cost": 0.02, "runnable": False, "byol": True},
    },
    "bg_replace": {
        "balanced": {"stack": "comfy_bg_replace(rmbg2)", "cost": 0.02, "runnable": False, "gpu": "T4"},
    },
    "inpaint": {
        "balanced": {"stack": "flux_fill", "cost": 0.03, "runnable": False, "gpu": "T4"},
    },
    "upscale": {
        "balanced": {"stack": "realesrgan_x4", "cost": 0.008, "runnable": False, "gpu": "T4"},
    },
    "flux_fill": {
        "balanced": {"stack": "flux_fill", "cost": 0.03, "runnable": False, "gpu": "T4"},
    },
    "sam_inpaint": {
        "balanced": {"stack": "sam2+flux_fill", "cost": 0.035, "runnable": False, "gpu": "T4"},
    },
    "ic_light": {
        "balanced": {"stack": "comfy_ic_light", "cost": 0.02, "runnable": False, "gpu": "T4"},
    },
    "texture": {
        "local": {"stack": "unsharp_microcontrast", "cost": 0.0, "runnable": True},
        "balanced": {"stack": "comfy_texture", "cost": 0.015, "runnable": False, "gpu": "T4"},
    },
    "edge": {
        "local": {"stack": "morphology_edge_clean", "cost": 0.0, "runnable": True},
        "balanced": {"stack": "comfy_edge", "cost": 0.012, "runnable": False},
    },
    "color": {
        "local": {"stack": "gray_world_whitebalance", "cost": 0.0, "runnable": True},
        "balanced": {"stack": "comfy_color_chart", "cost": 0.012, "runnable": False},
    },
    "sky": {"balanced": {"stack": "comfy_sky", "cost": 0.02, "runnable": False, "gpu": "T4"}},
    "comfy_cloth": {"balanced": {"stack": "comfy_cloth", "cost": 0.018, "runnable": False}},
    "outpaint": {"balanced": {"stack": "sd_outpaint", "cost": 0.025, "runnable": False, "gpu": "T4"}},
    "local_color": {"local": {"stack": "hsv_local_map", "cost": 0.0, "runnable": True}},
    "local_makeup": {"balanced": {"stack": "comfy_makeup", "cost": 0.02, "runnable": False}},
    "generative": {"balanced": {"stack": "comfy_face_swap", "cost": 0.05, "runnable": False, "redline": True}},
}


def resolve_engine(
    engine_key: str,
    tier: str = "balanced",
    *,
    require_runnable: bool = False,
) -> EngineChoice:
    """按档位降级链选引擎。require_runnable=True 时只返回本地可跑引擎（Demo 离线执行用）。"""
    table = _ENGINES.get(engine_key)
    if not table:
        raise EngineNotAvailableError(f"未登记的引擎键: {engine_key}")
    chain = TIER_CHAIN.get(tier, TIER_CHAIN["balanced"])
    fallback_notes: List[str] = []
    for t in chain:
        entry = table.get(t)
        if not entry:
            fallback_notes.append(f"{t}:无")
            continue
        if require_runnable and not entry.get("runnable"):
            fallback_notes.append(f"{t}:需外部栈({entry.get('stack')})")
            continue
        return EngineChoice(
            op=engine_key,
            tier=t,
            engine=entry["stack"],
            cost_cny=float(entry.get("cost", 0.0)),
            local=bool(entry.get("runnable", False)),
        )
    raise EngineNotAvailableError(
        f"引擎 '{engine_key}' 在档位 '{tier}' 无可用实现（降级链: {'->'.join(chain)}；{'；'.join(fallback_notes) or '无候选'}）"
    )


def resolve_for_op(
    op: str,
    engine_key: str,
    tier: str = "balanced",
    *,
    require_runnable: bool = False,
) -> EngineChoice:
    try:
        return resolve_engine(engine_key, tier, require_runnable=require_runnable)
    except EngineNotAvailableError:
        if require_runnable:
            raise
        # 降级到 local 再试
        return resolve_engine(engine_key, "local", require_runnable=False)
