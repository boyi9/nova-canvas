# -*- coding: utf-8 -*-
# file: backend/collab/permissions.py
# 作用：角色权限矩阵 —— 协作能力的单一事实来源
from __future__ import annotations

from typing import Iterable, Set

ROLE_OWNER = "owner"
ROLE_EDITOR = "editor"
ROLE_VIEWER = "viewer"

# 角色等级（数字越大权限越高）
ROLE_RANK: dict[str, int] = {
    ROLE_VIEWER: 1,
    ROLE_EDITOR: 2,
    ROLE_OWNER: 3,
}


class Permission(str):
    """权限常量（使用 str 便于 JSON 序列化）。"""

    PROJECT_READ = "project:read"
    PROJECT_WRITE = "project:write"
    PROJECT_DELETE = "project:delete"
    MEMBER_MANAGE = "member:manage"
    SHARE_MANAGE = "share:manage"
    VERSION_READ = "version:read"
    VERSION_CREATE = "version:create"
    VERSION_ROLLBACK = "version:rollback"
    APPROVAL_SUBMIT = "approval:submit"
    APPROVAL_REVIEW = "approval:review"
    SCHEDULE_MANAGE = "schedule:manage"
    PUBLISH_EXECUTE = "publish:execute"


_VIEWER: Set[str] = {
    Permission.PROJECT_READ,
    Permission.VERSION_READ,
}

_EDITOR: Set[str] = _VIEWER | {
    Permission.PROJECT_WRITE,
    Permission.VERSION_CREATE,
    Permission.APPROVAL_SUBMIT,
}

_OWNER: Set[str] = _EDITOR | {
    Permission.PROJECT_DELETE,
    Permission.MEMBER_MANAGE,
    Permission.SHARE_MANAGE,
    Permission.VERSION_ROLLBACK,
    Permission.APPROVAL_REVIEW,
    Permission.SCHEDULE_MANAGE,
    Permission.PUBLISH_EXECUTE,
}

ROLE_PERMISSIONS: dict[str, Set[str]] = {
    ROLE_VIEWER: _VIEWER,
    ROLE_EDITOR: _EDITOR,
    ROLE_OWNER: _OWNER,
}

# 高风险动作：即便自动化链路存在也必须人工确认（对齐 NC-CAP 红线理念）
RED_LINE_PERMISSIONS: Set[str] = {
    Permission.PROJECT_DELETE,
    Permission.PUBLISH_EXECUTE,
    Permission.MEMBER_MANAGE,
}


def can(role: str, permission: str) -> bool:
    """判断某角色是否具备某权限。未知角色视为无权限。"""
    return permission in ROLE_PERMISSIONS.get(role, set())


def missing(role: str, required: Iterable[str]) -> list[str]:
    """返回该角色缺失的权限列表。"""
    granted = ROLE_PERMISSIONS.get(role, set())
    return [p for p in required if p not in granted]


def is_red_line(permission: str) -> bool:
    """是否属于红线操作（需人工确认）。"""
    return permission in RED_LINE_PERMISSIONS


def require(role: str, permission: str) -> None:
    """权限不足时抛出 PermissionError。"""
    if not can(role, permission):
        raise PermissionError(f"角色 '{role}' 缺少权限 '{permission}'")