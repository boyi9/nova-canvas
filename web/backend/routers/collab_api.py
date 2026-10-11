# -*- coding: utf-8 -*-
# file: backend/routers/collab_api.py
# 作用：协作接口 —— 成员/RBAC、分享链接、版本历史、审批流、发布排期
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

from web.backend.collab import (
    Permission,
    can,
    get_collab_store,
    get_presence_bus,
    is_red_line,
)
from web.backend.projects import verify_token

router = APIRouter(prefix="/api/collab", tags=["collab"])


def _user(authorization: Optional[str]) -> str:
    user_id = verify_token(authorization)
    if user_id is None:
        raise HTTPException(status_code=401, detail="未登录或 token 无效")
    return user_id


def _role(project_id: str, user_id: str) -> str:
    """取用户角色；非成员返回 403。"""
    role = get_collab_store().role_of(project_id, user_id)
    if not role:
        raise HTTPException(status_code=403, detail="无权访问该项目")
    return role


def _authorize(project_id: str, user_id: str, permission: str) -> str:
    """校验权限；红线权限额外返回标记，供前端提示人工确认。"""
    role = _role(project_id, user_id)
    if not can(role, permission):
        raise HTTPException(status_code=403, detail=f"角色 '{role}' 缺少权限 '{permission}'")
    return role


# ── 请求体 ────────────────────────────────────────────────────────────────
class MemberIn(BaseModel):
    user_id: str
    role: str = "viewer"


class MemberRoleIn(BaseModel):
    role: str


class ShareIn(BaseModel):
    permission: str = "viewer"      # viewer | editor
    expires_in_s: Optional[int] = None


class VersionIn(BaseModel):
    canvas_data: str
    label: str = ""
    note: str = ""


class RollbackIn(BaseModel):
    version_id: str


class ApprovalIn(BaseModel):
    title: str
    kind: str = "content"


class ApprovalDecisionIn(BaseModel):
    approve: bool
    comment: str = ""


class ScheduleIn(BaseModel):
    channel: str
    scheduled_at: float
    payload: str = "{}"


# ── 成员 ──────────────────────────────────────────────────────────────────
@router.get("/{project_id}/members", summary="成员列表")
def list_members(project_id: str, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    user_id = _user(authorization)
    _role(project_id, user_id)
    members = get_collab_store().list_members(project_id)
    return {
        "members": [
            {"user_id": m.user_id, "role": m.role, "invited_at": m.invited_at, "invited_by": m.invited_by}
            for m in members
        ],
        "total": len(members),
    }


@router.post("/{project_id}/members", summary="添加成员")
def add_member(
    project_id: str, req: MemberIn, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _authorize(project_id, user_id, Permission.MEMBER_MANAGE)
    if req.role not in ("owner", "editor", "viewer"):
        raise HTTPException(status_code=400, detail=f"非法角色: {req.role}")
    m = get_collab_store().add_member(project_id, req.user_id, req.role, invited_by=user_id)
    return {"user_id": m.user_id, "role": m.role, "invited_at": m.invited_at}


@router.patch("/{project_id}/members/{member_id}", summary="调整成员角色")
def update_member_role(
    project_id: str,
    member_id: str,
    req: MemberRoleIn,
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _authorize(project_id, user_id, Permission.MEMBER_MANAGE)
    if req.role not in ("owner", "editor", "viewer"):
        raise HTTPException(status_code=400, detail=f"非法角色: {req.role}")
    store = get_collab_store()
    if store.get_member(project_id, member_id) is None:
        raise HTTPException(status_code=404, detail="成员不存在")
    m = store.add_member(project_id, member_id, req.role, invited_by=user_id)
    return {"user_id": m.user_id, "role": m.role}


@router.delete("/{project_id}/members/{member_id}", summary="移除成员")
def remove_member(
    project_id: str, member_id: str, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _authorize(project_id, user_id, Permission.MEMBER_MANAGE)
    if member_id == user_id:
        raise HTTPException(status_code=400, detail="不能移除自己")
    ok = get_collab_store().remove_member(project_id, member_id)
    if not ok:
        raise HTTPException(status_code=404, detail="成员不存在")
    return {"message": "removed"}


# ── 分享链接 ──────────────────────────────────────────────────────────────
@router.get("/{project_id}/shares", summary="分享链接列表")
def list_shares(project_id: str, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    user_id = _user(authorization)
    _role(project_id, user_id)
    links = get_collab_store().list_shares(project_id)
    return {
        "shares": [
            {
                "share_id": s.share_id,
                "permission": s.permission,
                "created_by": s.created_by,
                "created_at": s.created_at,
                "expires_at": s.expires_at,
                "revoked": s.revoked,
                "view_count": s.view_count,
                "red_line": is_red_line(Permission.PUBLISH_EXECUTE),
            }
            for s in links
        ],
        "total": len(links),
    }


@router.post("/{project_id}/shares", summary="创建分享链接")
def create_share(
    project_id: str, req: ShareIn, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _authorize(project_id, user_id, Permission.SHARE_MANAGE)
    if req.permission not in ("viewer", "editor"):
        raise HTTPException(status_code=400, detail="分享权限只能是 viewer 或 editor")
    s = get_collab_store().create_share(
        project_id, user_id, permission=req.permission, expires_in_s=req.expires_in_s
    )
    return {
        "share_id": s.share_id,
        "token": s.token,
        "permission": s.permission,
        "url": f"/share/{s.token}",
        "expires_at": s.expires_at,
    }


@router.delete("/{project_id}/shares/{share_id}", summary="撤销分享链接")
def revoke_share(
    project_id: str, share_id: str, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _authorize(project_id, user_id, Permission.SHARE_MANAGE)
    if not get_collab_store().revoke_share(share_id):
        raise HTTPException(status_code=404, detail="分享链接不存在")
    return {"message": "revoked"}


@router.get("/share/{token}", summary="通过分享令牌访问项目（公开只读入口）")
def access_shared(token: str) -> Dict[str, Any]:
    store = get_collab_store()
    link = store.get_share_by_token(token)
    if link is None:
        raise HTTPException(status_code=404, detail="分享链接无效")
    if link.revoked:
        raise HTTPException(status_code=410, detail="分享链接已撤销")
    if store.share_expired(link):
        raise HTTPException(status_code=410, detail="分享链接已过期")
    store.touch_share(link.share_id)
    versions = store.list_versions(link.project_id)
    return {
        "project_id": link.project_id,
        "permission": link.permission,
        "view_count": link.view_count + 1,
        "latest_version": {
            "version_id": versions[0].version_id,
            "label": versions[0].label,
            "created_at": versions[0].created_at,
        }
        if versions
        else None,
    }


# ── 版本历史 ──────────────────────────────────────────────────────────────
@router.get("/{project_id}/versions", summary="版本列表")
def list_versions(project_id: str, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    user_id = _user(authorization)
    _role(project_id, user_id)
    versions = get_collab_store().list_versions(project_id)
    return {
        "versions": [
            {
                "version_id": v.version_id,
                "label": v.label,
                "created_by": v.created_by,
                "created_at": v.created_at,
                "note": v.note,
                "size": len(v.canvas_data),
            }
            for v in versions
        ],
        "total": len(versions),
    }


@router.post("/{project_id}/versions", summary="创建版本快照")
def create_version(
    project_id: str, req: VersionIn, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _authorize(project_id, user_id, Permission.VERSION_CREATE)
    v = get_collab_store().create_version(
        project_id, user_id, req.canvas_data, label=req.label, note=req.note
    )
    return {
        "version_id": v.version_id,
        "label": v.label,
        "created_at": v.created_at,
        "note": v.note,
    }


@router.get("/{project_id}/versions/{version_id}", summary="版本详情（含画布数据）")
def get_version(
    project_id: str, version_id: str, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _role(project_id, user_id)
    v = get_collab_store().get_version(version_id)
    if v is None or v.project_id != project_id:
        raise HTTPException(status_code=404, detail="版本不存在")
    return {
        "version_id": v.version_id,
        "label": v.label,
        "created_by": v.created_by,
        "created_at": v.created_at,
        "note": v.note,
        "canvas_data": v.canvas_data,
    }


@router.post("/{project_id}/rollback", summary="回滚到指定版本（红线：需 owner）")
def rollback(
    project_id: str, req: RollbackIn, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _authorize(project_id, user_id, Permission.VERSION_ROLLBACK)
    store = get_collab_store()
    v = store.get_version(req.version_id)
    if v is None or v.project_id != project_id:
        raise HTTPException(status_code=404, detail="版本不存在")
    # 回滚本身也留痕：把当前状态存为一个新版本
    latest = store.latest_version(project_id)
    new_v = store.create_version(
        project_id,
        user_id,
        v.canvas_data,
        label=f"rollback->{v.label}",
        note=f"回滚自 {v.version_id}",
    )
    return {
        "restored_from": v.version_id,
        "new_version_id": new_v.version_id,
        "previous_version": latest.version_id if latest else None,
        "red_line": True,
    }


# ── 审批流 ────────────────────────────────────────────────────────────────
@router.get("/{project_id}/approvals", summary="审批列表")
def list_approvals(
    project_id: str,
    status: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _role(project_id, user_id)
    items = get_collab_store().list_approvals(project_id, status=status)
    return {
        "approvals": [
            {
                "request_id": a.request_id,
                "title": a.title,
                "kind": a.kind,
                "status": a.status,
                "requested_by": a.requested_by,
                "reviewer": a.reviewer,
                "created_at": a.created_at,
                "decided_at": a.decided_at,
                "comment": a.comment,
            }
            for a in items
        ],
        "total": len(items),
    }


@router.post("/{project_id}/approvals", summary="发起审批")
def create_approval(
    project_id: str, req: ApprovalIn, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _authorize(project_id, user_id, Permission.APPROVAL_SUBMIT)
    a = get_collab_store().create_approval(project_id, req.title, user_id, kind=req.kind)
    return {"request_id": a.request_id, "status": a.status, "created_at": a.created_at}


@router.post("/{project_id}/approvals/{request_id}/decision", summary="审批裁决")
def decide_approval(
    project_id: str,
    request_id: str,
    req: ApprovalDecisionIn,
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _authorize(project_id, user_id, Permission.APPROVAL_REVIEW)
    a = get_collab_store().decide_approval(
        request_id, user_id, approve=req.approve, comment=req.comment
    )
    if a is None:
        raise HTTPException(status_code=404, detail="审批不存在或已裁决")
    return {"request_id": a.request_id, "status": a.status, "decided_at": a.decided_at}


@router.post("/{project_id}/approvals/{request_id}/cancel", summary="撤销审批")
def cancel_approval(
    project_id: str, request_id: str, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _authorize(project_id, user_id, Permission.APPROVAL_SUBMIT)
    a = get_collab_store().cancel_approval(request_id)
    if a is None:
        raise HTTPException(status_code=404, detail="审批不存在或已裁决")
    return {"request_id": a.request_id, "status": a.status}


# ── 发布排期 ──────────────────────────────────────────────────────────────
@router.get("/{project_id}/schedules", summary="排期列表")
def list_schedules(
    project_id: str,
    due_before: Optional[float] = Query(None),
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _role(project_id, user_id)
    items = get_collab_store().list_schedules(project_id=project_id, due_before=due_before)
    return {
        "schedules": [
            {
                "schedule_id": s.schedule_id,
                "channel": s.channel,
                "scheduled_at": s.scheduled_at,
                "status": s.status,
                "created_by": s.created_by,
                "executed_at": s.executed_at,
                "result": s.result,
                "red_line": True,
            }
            for s in items
        ],
        "total": len(items),
        "now": time.time(),
    }


@router.post("/{project_id}/schedules", summary="创建发布排期")
def create_schedule(
    project_id: str, req: ScheduleIn, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _authorize(project_id, user_id, Permission.SCHEDULE_MANAGE)
    if req.scheduled_at <= 0:
        raise HTTPException(status_code=400, detail="scheduled_at 必须为正")
    s = get_collab_store().create_schedule(
        project_id, req.channel, req.scheduled_at, user_id, payload=req.payload
    )
    return {
        "schedule_id": s.schedule_id,
        "channel": s.channel,
        "scheduled_at": s.scheduled_at,
        "status": s.status,
    }


@router.post("/{project_id}/schedules/{schedule_id}/cancel", summary="取消排期")
def cancel_schedule(
    project_id: str, schedule_id: str, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _authorize(project_id, user_id, Permission.SCHEDULE_MANAGE)
    s = get_collab_store().cancel_schedule(schedule_id)
    if s is None:
        raise HTTPException(status_code=404, detail="排期不存在或已执行")
    return {"schedule_id": s.schedule_id, "status": s.status}


@router.post("/schedules/{schedule_id}/execute", summary="执行到期排期（红线：仅 owner）")
def execute_schedule(
    schedule_id: str, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    """由调度 worker 调用；发布属红线动作，必须 owner 权限且幂等。"""
    user_id = _user(authorization)
    store = get_collab_store()
    s = store.get_schedule(schedule_id)
    if s is None:
        raise HTTPException(status_code=404, detail="排期不存在")
    _authorize(s.project_id, user_id, Permission.PUBLISH_EXECUTE)
    result = store.mark_published(schedule_id, result=f"executed by {user_id}")
    if result is None:
        raise HTTPException(status_code=409, detail="排期已执行或已取消")
    return {"schedule_id": result.schedule_id, "status": result.status, "executed_at": result.executed_at}


# ── 实时 Presence（在线状态/输入指示/光标）──────────────────────
class PresenceJoinIn(BaseModel):
    user_name: str
    role: str = "viewer"


class CursorIn(BaseModel):
    x: float = 0.0
    y: float = 0.0
    zoom: float = 1.0


class TypingIn(BaseModel):
    typing: bool


def _presence_session(project_id: str, user_id: str) -> str:
    """取或创建用户的 presence session（同一用户同项目复用）。"""
    bus = get_presence_bus()
    for s in bus.list_project(project_id):
        if s.user_id == user_id:
            return s.session_id
    raise HTTPException(status_code=404, detail="未加入 presence，请先调用 join")


@router.post("/{project_id}/presence/join", summary="加入项目实时协同")
def presence_join(
    project_id: str, req: PresenceJoinIn, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _user(authorization)
    _role(project_id, user_id)  # 必须是项目成员
    bus = get_presence_bus()
    session = bus.join(
        user_id=user_id,
        user_name=req.user_name,
        project_id=project_id,
        role=req.role,
    )
    return {
        "session_id": session.session_id,
        "user_id": session.user_id,
        "user_name": session.user_name,
        "project_id": session.project_id,
        "connected_at": session.connected_at,
    }


@router.post("/{project_id}/presence/leave", summary="离开项目实时协同")
def presence_leave(
    project_id: str, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _user(authorization)
    session_id = _presence_session(project_id, user_id)
    get_presence_bus().leave(session_id)
    return {"session_id": session_id, "left": True}


@router.post("/{project_id}/presence/cursor", summary="更新光标位置")
def presence_cursor(
    project_id: str, req: CursorIn, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _user(authorization)
    session_id = _presence_session(project_id, user_id)
    cursor = {"x": req.x, "y": req.y, "zoom": req.zoom}
    get_presence_bus().update_cursor(session_id, cursor)
    return {"session_id": session_id, "cursor": cursor}


@router.post("/{project_id}/presence/typing", summary="设置输入状态")
def presence_typing(
    project_id: str, req: TypingIn, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _user(authorization)
    session_id = _presence_session(project_id, user_id)
    get_presence_bus().set_typing(session_id, req.typing)
    return {"session_id": session_id, "typing": req.typing}


@router.get("/{project_id}/presence", summary="在线成员列表")
def presence_list(project_id: str, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    user_id = _user(authorization)
    _role(project_id, user_id)
    sessions = get_presence_bus().list_project(project_id)
    return {
        "project_id": project_id,
        "online": [
            {
                "session_id": s.session_id,
                "user_id": s.user_id,
                "user_name": s.user_name,
                "role": s.role,
                "typing": s.typing,
                "cursor": s.cursor,
                "last_active": s.last_active,
            }
            for s in sessions
        ],
        "count": len(sessions),
    }