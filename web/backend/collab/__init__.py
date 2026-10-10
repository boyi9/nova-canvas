# -*- coding: utf-8 -*-
# file: backend/collab/__init__.py
# 作用：团队协作域 —— 成员与角色(RBAC)/分享链接/版本历史/审批流/发布排期
from __future__ import annotations

from .permissions import (
    ROLE_EDITOR,
    ROLE_OWNER,
    ROLE_RANK,
    ROLE_VIEWER,
    Permission,
    can,
    is_red_line,
    missing,
    require,
)
from .store import (
    ApprovalRequest,
    CollabStore,
    Member,
    PublishSchedule,
    ShareLink,
    VersionSnapshot,
    get_collab_store,
    reset_collab_store,
)

__all__ = [
    "ROLE_OWNER",
    "ROLE_EDITOR",
    "ROLE_VIEWER",
    "ROLE_RANK",
    "ApprovalRequest",
    "CollabStore",
    "Member",
    "PublishSchedule",
    "ShareLink",
    "VersionSnapshot",
    "get_collab_store",
    "reset_collab_store",
    "Permission",
    "can",
    "is_red_line",
    "missing",
    "require",
]