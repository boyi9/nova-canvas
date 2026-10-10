"""接缝总线 API 路由。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

from .handoff_models import HandoffType, HandoffState
from .handoff_bus import get_bus, HandoffBus
from .handoff_audit import get_audit_log

router = APIRouter(prefix="/api/host", tags=["host"])


class CreateTaskRequest(BaseModel):
    task_id: str
    htype: HandoffType
    project_id: str
    title: str
    payload: Optional[Dict[str, Any]] = None
    assignee: str = ""


class DispatchRequest(BaseModel):
    assignee: str = ""


class AcceptRequest(BaseModel):
    actor: str


class SubmitRequest(BaseModel):
    payload: Dict[str, Any]
    actor: str


class ValidateRequest(BaseModel):
    actor: str = "system"


class TaskResponse(BaseModel):
    task_id: str
    htype: str
    project_id: str
    title: str
    payload: Dict[str, Any]
    assignee: str
    state: str
    created_at: str
    sla_deadline: str
    reminders: int
    idempotency_keys: List[str]
    audit: List[Dict[str, Any]]


@router.post("/tasks", response_model=TaskResponse)
def create_task(req: CreateTaskRequest):
    bus = get_bus()
    task = bus.create(
        task_id=req.task_id,
        htype=req.htype,
        project_id=req.project_id,
        title=req.title,
        payload=req.payload,
        assignee=req.assignee,
    )
    return TaskResponse(**task.to_dict())


@router.post("/tasks/{task_id}/dispatch", response_model=TaskResponse)
def dispatch_task(task_id: str, req: DispatchRequest):
    bus = get_bus()
    task = bus.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    bus.dispatch(task_id, req.assignee)
    return TaskResponse(**task.to_dict())


@router.post("/tasks/{task_id}/accept", response_model=TaskResponse)
def accept_task(task_id: str, req: AcceptRequest):
    bus = get_bus()
    task = bus.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    bus.accept(task_id, req.actor)
    return TaskResponse(**task.to_dict())


@router.post("/tasks/{task_id}/submit", response_model=TaskResponse)
def submit_task(task_id: str, req: SubmitRequest):
    bus = get_bus()
    task = bus.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    bus.submit(task_id, req.payload, req.actor)
    return TaskResponse(**task.to_dict())


@router.post("/tasks/{task_id}/validate", response_model=TaskResponse)
def validate_task(task_id: str, req: ValidateRequest):
    bus = get_bus()
    task = bus.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")

    def validator(t: Any) -> tuple:
        # 简化：检查 payload 是否有 deliverables
        required = {
            "shoot": ["video_clip"],
            "authorize": ["signed_release"],
            "supply": ["asset_file"],
            "review": ["approved"],
            "final_approve": ["confirm_publish"],
        }
        htype = t.htype.value if hasattr(t.htype, "value") else str(t.htype)
        for field in required.get(htype, []):
            if field not in t.payload:
                return False, f"missing deliverable: {field}"
        return True, "all deliverables present"

    bus.validate(task_id, validator, req.actor)
    return TaskResponse(**task.to_dict())


@router.post("/tasks/{task_id}/resume", response_model=TaskResponse)
def resume_task(task_id: str):
    bus = get_bus()
    task = bus.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")

    def downstream(t: Any) -> None:
        # 实际项目中应触发下游工作流（如粗剪、素材入库等）
        t._log("downstream_triggered", "auto_resume")

    bus.resume(task_id, downstream)
    return TaskResponse(**task.to_dict())


@router.get("/tasks", response_model=List[TaskResponse])
def list_tasks(
    state: Optional[HandoffState] = None,
    htype: Optional[HandoffType] = None,
    project_id: Optional[str] = None,
):
    bus = get_bus()
    tasks = bus.list_tasks(state=state, htype=htype, project_id=project_id)
    return [TaskResponse(**t.to_dict()) for t in tasks]


@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(task_id: str):
    bus = get_bus()
    task = bus.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    return TaskResponse(**task.to_dict())


@router.get("/tasks/{task_id}/audit")
def get_task_audit(task_id: str):
    audit_log = get_audit_log()
    entries = audit_log.get_task_audit(task_id)
    return {"entries": [e.to_dict() for e in entries]}


@router.get("/tasks/{task_id}/audit/export")
def export_audit(task_id: str, format: str = "json"):
    audit_log = get_audit_log()
    if format not in ("json", "csv"):
        raise HTTPException(status_code=400, detail="format must be json or csv")
    content = audit_log.export_audit_report(task_id, format)
    media_type = "application/json" if format == "json" else "text/csv"
    from fastapi.responses import Response
    return Response(content=content, media_type=media_type)


@router.post("/tasks/check-timeouts")
def check_timeouts():
    bus = get_bus()
    results = bus.check_timeouts()
    return {"results": results}