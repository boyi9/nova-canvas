# -*- coding: utf-8 -*-
# file: backend/routers/retouch_api.py
# 作用：NC-RET 修图引擎 API —— 意图解析 / 质检 / 合规闸门 / 本地执行 / 批量配方
from __future__ import annotations

import base64
import io
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from PIL import Image
from pydantic import BaseModel, Field

from web.backend.retouch.batch import make_recipe, recipe_fingerprint, run_batch
from web.backend.retouch.compliance import gate_before_execute, startup_assert_retouch_config
from web.backend.retouch.core.qc import qc_retouch
from web.backend.retouch.engine_router import EngineNotAvailableError, resolve_for_op
from web.backend.retouch.intent import check_redlines, parse_retouch_intent
from web.backend.retouch.ops import OPS, get_op
from web.backend.retouch.orchestrator import execution_plan
from web.backend.retouch.portrait import LOCAL_OPS, execute_local_ops, local_coverage

router = APIRouter(prefix="/api/retouch", tags=["retouch"])


def _decode_image(b64: str) -> Image.Image:
    try:
        raw = base64.b64decode(b64)
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"图片解码失败: {e}")


def _encode_image(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


class ParseIn(BaseModel):
    text: str
    target: str = "auto"
    auth: Dict[str, bool] = Field(default_factory=dict)


class QcIn(BaseModel):
    before_b64: str
    after_b64: str
    ops: List[str] = Field(default_factory=list)


class GateIn(BaseModel):
    spec: Dict[str, Any]
    target: str = "any"
    auth: Dict[str, bool] = Field(default_factory=dict)
    is_auto: bool = False
    action: str = ""
    human_confirm: bool = False


class ExecuteIn(BaseModel):
    image_b64: str
    ops: List[str]
    strength: float = 0.5
    tier: str = "local"


class BatchIn(BaseModel):
    target: str
    ops: List[str]
    strength: float = 0.5
    label: str = ""
    sample_asset_id: str = ""
    asset_ids: List[str]
    concurrency: int = 4


class StartupAssertIn(BaseModel):
    auto_actions: List[str] = Field(default_factory=list)


@router.get("/ops", summary="修图算子目录")
def list_ops() -> Dict[str, Any]:
    return {
        "ops": [
            {
                "name": op.name,
                "cn": op.cn,
                "scope": op.scope,
                "risk": op.risk,
                "requires": list(op.requires),
                "engine": op.engine,
                "local_runnable": op.name in LOCAL_OPS,
            }
            for op in OPS.values()
        ]
    }


@router.post("/parse", summary="自然语言修图指令解析（NC-RET-01）")
def parse_intent(req: ParseIn) -> Dict[str, Any]:
    spec = parse_retouch_intent(req.text, target=req.target, auth=req.auth)
    data = spec.to_dict()
    data["plan"] = execution_plan(spec.ops)
    data["gates"] = {
        "portrait_auth_required": any(o in ("face_reshape", "body_reshape", "makeup", "face_swap") for o in spec.ops),
        "ip_clear_required": "remove_watermark" in spec.ops,
        "redline": "face_swap" in spec.ops,
    }
    return data


@router.post("/qc", summary="修图质检闸门（NC-RET-06）")
def do_qc(req: QcIn) -> Dict[str, Any]:
    before = _decode_image(req.before_b64)
    after = _decode_image(req.after_b64)
    return qc_retouch(before, after, req.ops)


@router.post("/gate", summary="执行前合规闸门（NC-RET-12）")
def do_gate(req: GateIn) -> Dict[str, Any]:
    task = {
        "spec": {"ops": req.spec.get("ops", [])},
        "target": req.target or req.spec.get("target", "any"),
        "is_auto": req.is_auto,
        "action": req.action,
        "human_confirm": req.human_confirm,
    }
    allowed, reasons = gate_before_execute(task, req.auth)
    return {"allowed": allowed, "reasons": reasons}


@router.post("/startup-assert", summary="启动期红线断言")
def startup_assert(req: StartupAssertIn) -> Dict[str, Any]:
    try:
        startup_assert_retouch_config(req.auto_actions)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}


@router.post("/execute", summary="本地执行（L1/L2 人像算子；其余返回引擎要求）")
def do_execute(req: ExecuteIn) -> Dict[str, Any]:
    unknown = [o for o in req.ops if o not in OPS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"未知算子: {unknown}")
    img = _decode_image(req.image_b64)
    coverage = local_coverage(req.ops)
    external = coverage["external"]
    if external:
        # 未接外部栈的算子：返回所需引擎信息而非假装成功
        engines = []
        for item in external:
            try:
                choice = resolve_for_op(item["op"], get_op(item["op"]).engine, req.tier)
                engines.append({"op": item["op"], "engine": choice.engine, "tier": choice.tier, "cost_cny": choice.cost_cny})
            except EngineNotAvailableError as e:
                engines.append({"op": item["op"], "error": str(e)})
        raise HTTPException(
            status_code=501,
            detail={
                "message": "部分算子需要外部引擎栈（ComfyUI/PS），本地不可执行",
                "external": engines,
                "local_ops": coverage["local"],
            },
        )
    try:
        result_img = execute_local_ops(img, req.ops, strength=req.strength)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"本地无此算子实现: {e}")
    qc = qc_retouch(img, result_img, req.ops)
    return {
        "success": True,
        "ops": req.ops,
        "strength": req.strength,
        "before_b64": req.image_b64,
        "after_b64": _encode_image(result_img),
        "qc": qc,
    }


@router.post("/batch", summary="批量精修（配方指纹 + 幂等 + 失败隔离）")
def do_batch(req: BatchIn) -> Dict[str, Any]:
    if not req.asset_ids:
        raise HTTPException(status_code=400, detail="asset_ids 不能为空")
    unknown = [o for o in req.ops if o not in OPS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"未知算子: {unknown}")

    recipe = make_recipe(
        {"target": req.target, "ops": req.ops, "strength": req.strength, "label": req.label},
        req.sample_asset_id or (req.asset_ids[0] if req.asset_ids else ""),
    )

    def _worker(asset_id: str, r: Dict[str, Any]) -> Dict[str, Any]:
        # 队列登记桩：真实像素处理走 worker/retouch_worker（GPU 节点）
        return {"asset_id": asset_id, "status": "accepted", "recipe_fingerprint": recipe_fingerprint(r)}

    result = run_batch(req.asset_ids, recipe, _worker, concurrency=req.concurrency)
    return result
