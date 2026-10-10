# -*- coding: utf-8 -*-
# file: backend/routers/projects_api.py
# 作用：项目持久化接口 —— Bearer 鉴权（tok_<user_id> 自编码）+ JSON 文件落盘 CRUD
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from web.backend.projects import (
    get_project_store,
    verify_token,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _require_user(authorization: Optional[str]) -> str:
    user_id = verify_token(authorization)
    if user_id is None:
        raise HTTPException(status_code=401, detail="未登录或 token 无效")
    return user_id


class CreateIn(BaseModel):
    name: str
    scene: str = ""
    description: str = ""


class UpdateIn(BaseModel):
    name: Optional[str] = None
    canvas_data: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None


# ── 项目 CRUD ────────────────────────────────────────────────────────────
@router.get("", summary="项目列表")
def list_projects(
    limit: int = 20,
    offset: int = 0,
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    user_id = _require_user(authorization)
    store = get_project_store()
    items, total = store.list_projects(user_id, limit=limit, offset=offset)
    return {
        "projects": [
            {
                "id": p.id,
                "name": p.name,
                "scene": p.scene,
                "description": p.description,
                "status": p.status,
                "created_at": p.created_at,
                "updated_at": p.updated_at,
            }
            for p in items
        ],
        "total": total,
    }


@router.post("", summary="创建项目")
def create_project(
    req: CreateIn, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _require_user(authorization)
    store = get_project_store()
    p = store.create_project(user_id, req.name, req.scene, req.description)
    # 项目创建者自动成为 owner（否则无人能授予第一个成员，形成死锁）
    try:
        from web.backend.collab import ROLE_OWNER, get_collab_store

        get_collab_store().add_member(p.id, user_id, ROLE_OWNER, invited_by=user_id)
    except Exception:
        # 协作域不可用不应阻断项目创建
        pass
    return p.to_dict()


@router.put("/{project_id}", summary="更新项目（含画布数据落盘）")
def update_project(
    project_id: str,
    req: UpdateIn,
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    user_id = _require_user(authorization)
    store = get_project_store()
    p = store.update_project(
        project_id,
        user_id,
        name=req.name,
        canvas_data=req.canvas_data,
        status=req.status,
        description=req.description,
    )
    if p is None:
        raise HTTPException(status_code=404, detail="项目不存在或无权限")
    return p.to_dict()


@router.delete("/{project_id}", summary="删除项目")
def delete_project(
    project_id: str, authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    user_id = _require_user(authorization)
    store = get_project_store()
    ok = store.delete_project(project_id, user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="项目不存在或无权限")
    return {"message": "deleted"}
