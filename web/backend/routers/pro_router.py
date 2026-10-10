# -*- coding: utf-8 -*-
# file: backend/routers/pro_router.py
# 作用：专业管线接口 —— 接真 pipeline_gateway 策略闸门 + ProScheduler 调度 + ledger 台账
from __future__ import annotations

import secrets
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

from web.backend.pro import ledger
from web.backend.pro.pipeline_gateway import (
    AUTO_ACTIONS,
    DCC,
    DCC_CAPABILITY,
    REDLINE_ACTIONS,
    PipelineJob,
    Route,
)
from web.backend.pro.scheduler import ProRenderTask, ProScheduler, TaskPriority, TaskStatus

router = APIRouter(prefix="/api/pro", tags=["pro"])

_scheduler: Optional[ProScheduler] = None
_jobs: Dict[str, Dict[str, Any]] = {}

_DCC_ALIASES: Dict[str, DCC] = {
    "ae": DCC.AE,
    "after_effects": DCC.AE,
    "aftereffects": DCC.AE,
    "nuke": DCC.NUKE,
    "maya": DCC.MAYA,
}


def get_pro_scheduler() -> ProScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = ProScheduler()
    return _scheduler


def reset_pro_state() -> None:
    """测试用：重置模块级状态。"""
    global _scheduler
    _scheduler = None
    _jobs.clear()


def _resolve_dcc(pipeline: str) -> DCC:
    key = (pipeline or "").strip().lower().replace("-", "_").replace(" ", "_")
    dcc = _DCC_ALIASES.get(key)
    if dcc is None:
        for d in DCC:
            if key == d.value:
                return d
        raise HTTPException(
            status_code=400,
            detail=f"未知管线: {pipeline}，支持: {[d.value for d in DCC]}",
        )
    return dcc


class PipelineJobRequest(BaseModel):
    pipeline: str
    shot_id: str
    version: str = "v001"
    template: str = ""
    assets: Dict[str, str] = {}
    actions: List[str] = []
    license_ok: bool = False
    color_config: str = ""


class RenderTaskRequest(BaseModel):
    pipeline: str
    shot_id: str
    version: str = "v001"
    priority: int = 1
    payload: Dict = {}
    max_retries: int = 2


class VersionCheckRequest(BaseModel):
    shot_id: str
    version: str
    render_root: str = "/renders"


class ShotIn(BaseModel):
    shot_id: str
    project_id: str = "PRJ"
    scene: str = ""
    description: str = ""


class VersionIn(BaseModel):
    shot_id: str
    version: str
    process_type: str = "AE"
    engine_file: str = ""
    render_path: str = ""
    color_config: str = ""


class AssetIn(BaseModel):
    asset_id: str
    type: str = "texture"
    source: str = "user_uploaded"
    license: str = ""
    path: str = ""


@router.post("/pipeline/job", summary="提交专业管线作业（策略闸门）")
def submit_pipeline_job(req: PipelineJobRequest):
    """提交专业管线作业（AE/Nuke/Maya）。红线动作 / 缺授权 / 缺色彩声明一律拒绝。"""
    dcc = _resolve_dcc(req.pipeline)
    job_id = f"job_{req.shot_id}_{req.version}_{secrets.token_hex(3)}"
    job = PipelineJob(
        job_id=job_id,
        dcc=dcc,
        route=Route.HOST_SCRIPT,
        shot_id=req.shot_id,
        version=req.version,
        template=req.template,
        assets=req.assets,
        actions=req.actions,
        license_ok=req.license_ok,
        color_config=req.color_config,
    )
    try:
        plan = job.plan()
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    _jobs[job_id] = {"job": job, "plan": plan, "status": "planned"}
    if req.shot_id not in [s for s in _list_shot_ids()]:
        ledger.register_shot(
            ledger.ProShot(
                shot_id=req.shot_id,
                project_id="PRJ",
                scene=req.template or "-",
                description=req.template,
            )
        )
    if req.actions and "build_version" in req.actions:
        ledger.register_version(
            ledger.ProVersion(
                shot_id=req.shot_id,
                version=req.version,
                process_type=dcc.value.upper(),
                engine_file=plan["engine_file"],
                render_path=f"/renders/{req.shot_id}/{req.version}",
                color_config=req.color_config,
            )
        )
    return {
        "success": True,
        "job_id": job_id,
        "plan": plan,
        "auto_actions": sorted(AUTO_ACTIONS),
        "redlines": sorted(REDLINE_ACTIONS),
    }


@router.post("/render/task", summary="提交渲染任务到调度器")
def submit_render_task(req: RenderTaskRequest):
    """提交渲染任务（本地优先 → 云溢出 → 重试）。"""
    _resolve_dcc(req.pipeline)
    sched = get_pro_scheduler()
    try:
        priority = TaskPriority(req.priority)
    except ValueError:
        priority = TaskPriority.NORMAL
    task = ProRenderTask(
        task_id=f"task_{req.shot_id}_{req.version}_{secrets.token_hex(3)}",
        pipeline=req.pipeline,
        shot_id=req.shot_id,
        version=req.version,
        priority=priority,
        payload=req.payload,
        max_retries=req.max_retries,
    )
    sched.submit(task)
    sched.process_queue()
    return {
        "success": True,
        "task_id": task.task_id,
        "status": task.status.value,
        "render_tier": task.render_tier,
        "assigned_node": task.assigned_node,
    }


@router.get("/tasks/{task_id}", summary="查询任务状态")
def get_task_status(task_id: str):
    sched = get_pro_scheduler()
    task = sched.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"任务不存在: {task_id}")
    return {
        "task_id": task.task_id,
        "status": task.status.value,
        "render_tier": task.render_tier,
        "actual_cost": task.actual_cost,
        "retries": task.retries,
        "error": task.error,
        "shot_id": task.shot_id,
        "version": task.version,
    }


@router.get("/shots/{shot_id}/versions", summary="查询镜头版本列表")
def get_shot_versions(shot_id: str):
    versions = ledger.get_shot_versions(shot_id)
    return {
        "versions": [
            {
                "shot_id": v.shot_id,
                "version": v.version,
                "process_type": v.process_type,
                "engine_file": v.engine_file,
                "render_path": v.render_path,
                "color_config": v.color_config,
                "created_at": v.created_at,
            }
            for v in versions
        ],
        "latest": ledger.get_latest_version_of_shot(shot_id),
    }


@router.post("/version/check", summary="校验交付版本是否最新（台账）")
def check_version(req: VersionCheckRequest):
    latest = ledger.get_latest_version_of_shot(req.shot_id)
    if latest is None:
        raise HTTPException(status_code=404, detail=f"镜头无台账版本: {req.shot_id}")
    return {
        "is_latest": req.version == latest,
        "latest_version": latest,
        "requested": req.version,
    }


@router.get("/shots", summary="获取镜头列表（台账）")
def list_shots(project_id: Optional[str] = None):
    shots = ledger.list_shots()
    if project_id:
        shots = [s for s in shots if s.project_id == project_id]
    return {
        "shots": [
            {
                "shot_id": s.shot_id,
                "project_id": s.project_id,
                "scene": s.scene,
                "description": s.description,
                "status": s.status,
            }
            for s in shots
        ]
    }


@router.get("/assets", summary="获取资产列表（台账）")
def list_assets(shot_id: Optional[str] = None, type: Optional[str] = None):
    assets = ledger.list_assets()
    if type:
        assets = [a for a in assets if a.type == type]
    return {
        "assets": [
            {
                "asset_id": a.asset_id,
                "type": a.type,
                "source": a.source,
                "license": a.license,
                "path": a.path,
            }
            for a in assets
        ]
    }


@router.post("/shots", summary="登记镜头（台账）")
def register_shot(req: ShotIn):
    ledger.register_shot(
        ledger.ProShot(
            shot_id=req.shot_id,
            project_id=req.project_id,
            scene=req.scene,
            description=req.description,
        )
    )
    return {"success": True, "shot_id": req.shot_id}


@router.post("/versions", summary="登记版本（台账）")
def register_version(req: VersionIn):
    ledger.register_version(
        ledger.ProVersion(
            shot_id=req.shot_id,
            version=req.version,
            process_type=req.process_type,
            engine_file=req.engine_file,
            render_path=req.render_path,
            color_config=req.color_config,
        )
    )
    return {"success": True, "shot_id": req.shot_id, "version": req.version}


@router.post("/assets", summary="登记资产（台账）")
def register_asset(req: AssetIn):
    ledger.register_asset(
        ledger.ProAsset(
            asset_id=req.asset_id,
            type=req.type,
            source=req.source,
            license=req.license,
            path=req.path,
        )
    )
    return {"success": True, "asset_id": req.asset_id}


@router.post("/deliveries", summary="记录交付（台账）")
def create_delivery(
    shot_id: str = Body(...),
    version: str = Body(...),
    files: List[str] = Body(...),
    channel_manifest: Dict = Body(...),
):
    delivery_id = f"del_{shot_id}_{version}_{secrets.token_hex(3)}"
    latest = ledger.get_latest_version_of_shot(shot_id)
    if latest is not None and version != latest:
        raise HTTPException(
            status_code=409,
            detail=f"交付版本 {version} 不是台账最新版本 {latest}，拒绝交付",
        )
    ledger.register_delivery(
        ledger.ProDelivery(
            delivery_id=delivery_id,
            shot_id=shot_id,
            version=version,
            files=files,
            channel_manifest=channel_manifest,
        )
    )
    return {"success": True, "delivery_id": delivery_id}


@router.get("/deliveries", summary="查询交付记录（台账）")
def list_deliveries(shot_id: Optional[str] = None, limit: int = 20):
    deliveries = ledger.list_deliveries()
    if shot_id:
        deliveries = [d for d in deliveries if d.shot_id == shot_id]
    deliveries = deliveries[: max(limit, 0)]
    return {
        "deliveries": [
            {
                "delivery_id": d.delivery_id,
                "shot_id": d.shot_id,
                "version": d.version,
                "files": d.files,
                "channel_manifest": d.channel_manifest,
                "delivered_at": d.delivered_at,
            }
            for d in deliveries
        ]
    }


@router.get("/shots/{shot_id}/versions/{version}/latest", summary="校验版本是否最新")
def check_latest_version(shot_id: str, version: str):
    latest = ledger.get_latest_version_of_shot(shot_id)
    return {"is_latest": latest == version, "latest_version": latest or version}


def _list_shot_ids() -> List[str]:
    return [s.shot_id for s in ledger.list_shots()]
