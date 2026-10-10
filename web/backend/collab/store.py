# -*- coding: utf-8 -*-
# file: backend/collab/store.py
# 作用：协作域持久化 —— 成员/分享/版本/审批/排期，统一落 SQLite
from __future__ import annotations

import secrets
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from web.backend.collab.permissions import ROLE_OWNER
from web.backend.services.db import Database

NS_MEMBER = "collab.member"
NS_SHARE = "collab.share"
NS_VERSION = "collab.version"
NS_APPROVAL = "collab.approval"
NS_SCHEDULE = "collab.schedule"


@dataclass
class Member:
    project_id: str
    user_id: str
    role: str = "viewer"          # owner | editor | viewer
    invited_at: float = field(default_factory=time.time)
    invited_by: str = ""


@dataclass
class ShareLink:
    share_id: str
    project_id: str
    token: str
    permission: str = "viewer"    # viewer | editor
    created_by: str = ""
    created_at: float = field(default_factory=time.time)
    expires_at: Optional[float] = None
    revoked: bool = False
    view_count: int = 0


@dataclass
class VersionSnapshot:
    version_id: str
    project_id: str
    label: str = ""
    canvas_data: str = ""
    created_by: str = ""
    created_at: float = field(default_factory=time.time)
    note: str = ""


@dataclass
class ApprovalRequest:
    request_id: str
    project_id: str
    title: str
    kind: str = "content"          # content | publish | brand
    status: str = "pending"        # pending | approved | rejected | canceled
    requested_by: str = ""
    reviewer: str = ""
    created_at: float = field(default_factory=time.time)
    decided_at: Optional[float] = None
    comment: str = ""


@dataclass
class PublishSchedule:
    schedule_id: str
    project_id: str
    channel: str                   # 平台标识（douyin/xiaohongshu/...）
    scheduled_at: float
    status: str = "pending"        # pending | published | failed | canceled
    payload: str = "{}"
    created_by: str = ""
    created_at: float = field(default_factory=time.time)
    executed_at: Optional[float] = None
    result: str = ""


def _member_key(project_id: str, user_id: str) -> str:
    return f"{project_id}::{user_id}"


class CollabStore:
    """协作域存储：全部落 SQLite，重启不丢。"""

    def __init__(self, db: Optional[Database] = None, db_path: Optional[Path] = None) -> None:
        self._lock = threading.RLock()
        self._db = db if db is not None else Database.instance(db_path)

    # ── 通用读写 ──────────────────────────────────────────────────────────
    def _put(self, ns: str, key: str, obj: Any) -> None:
        self._db.put(ns, key, asdict(obj))

    def _get(self, ns: str, key: str, cls):
        item = self._db.get(ns, key)
        if item is None:
            return None
        item.pop("_id", None)
        return cls(**{k: v for k, v in item.items() if k in cls.__dataclass_fields__})

    def _all(self, ns: str, cls) -> List[Any]:
        out = []
        for item in self._db.list(ns):
            doc_id = item.pop("_id", None)
            if doc_id:
                out.append((doc_id, cls(**{k: v for k, v in item.items() if k in cls.__dataclass_fields__})))
        return out

    def _filter(self, ns: str, cls, **match) -> List[Any]:
        result = []
        for doc_id, obj in self._all(ns, cls):
            if all(getattr(obj, f, None) == v for f, v in match.items()):
                result.append(obj)
        return result

    # ── 成员 ──────────────────────────────────────────────────────────────
    def add_member(self, project_id: str, user_id: str, role: str, invited_by: str = "") -> Member:
        with self._lock:
            m = Member(project_id=project_id, user_id=user_id, role=role, invited_by=invited_by)
            self._put(NS_MEMBER, _member_key(project_id, user_id), m)
            return m

    def get_member(self, project_id: str, user_id: str) -> Optional[Member]:
        return self._get(NS_MEMBER, _member_key(project_id, user_id), Member)

    def list_members(self, project_id: str) -> List[Member]:
        return self._filter(NS_MEMBER, Member, project_id=project_id)

    def remove_member(self, project_id: str, user_id: str) -> bool:
        with self._lock:
            return self._db.delete(NS_MEMBER, _member_key(project_id, user_id))

    def role_of(self, project_id: str, user_id: str) -> str:
        """取用户在该项目的角色；非成员返回空串（调用方按未授权处理）。"""
        m = self.get_member(project_id, user_id)
        return m.role if m else ""

    # ── 分享链接 ──────────────────────────────────────────────────────────
    def create_share(
        self,
        project_id: str,
        created_by: str,
        permission: str = "viewer",
        expires_in_s: Optional[int] = None,
    ) -> ShareLink:
        with self._lock:
            link = ShareLink(
                share_id=f"shr_{secrets.token_hex(8)}",
                project_id=project_id,
                token=secrets.token_urlsafe(16),
                permission=permission,
                created_by=created_by,
                expires_at=(time.time() + expires_in_s) if expires_in_s else None,
            )
            self._put(NS_SHARE, link.share_id, link)
            return link

    def get_share(self, share_id: str) -> Optional[ShareLink]:
        return self._get(NS_SHARE, share_id, ShareLink)

    def get_share_by_token(self, token: str) -> Optional[ShareLink]:
        """按 token 查找分享链接（恒定时间比较，避免时序侧信道）。"""
        with self._lock:
            for _, link in self._all(NS_SHARE, ShareLink):
                if secrets.compare_digest(link.token, token):
                    return link
            return None

    def list_shares(self, project_id: str) -> List[ShareLink]:
        return self._filter(NS_SHARE, ShareLink, project_id=project_id)

    def revoke_share(self, share_id: str) -> bool:
        with self._lock:
            link = self.get_share(share_id)
            if link is None:
                return False
            link.revoked = True
            self._put(NS_SHARE, share_id, link)
            return True

    def touch_share(self, share_id: str) -> None:
        """访问计数 +1。"""
        with self._lock:
            link = self.get_share(share_id)
            if link is None:
                return
            link.view_count += 1
            self._put(NS_SHARE, share_id, link)

    def share_expired(self, link: ShareLink) -> bool:
        return link.expires_at is not None and time.time() > link.expires_at

    # ── 版本历史 ──────────────────────────────────────────────────────────
    def create_version(
        self,
        project_id: str,
        created_by: str,
        canvas_data: str,
        label: str = "",
        note: str = "",
    ) -> VersionSnapshot:
        with self._lock:
            seq = len(self._filter(NS_VERSION, VersionSnapshot, project_id=project_id)) + 1
            snap = VersionSnapshot(
                version_id=f"{project_id}_v{seq:04d}",
                project_id=project_id,
                label=label or f"v{seq}",
                canvas_data=canvas_data,
                created_by=created_by,
                note=note,
            )
            self._put(NS_VERSION, snap.version_id, snap)
            return snap

    def get_version(self, version_id: str) -> Optional[VersionSnapshot]:
        return self._get(NS_VERSION, version_id, VersionSnapshot)

    def list_versions(self, project_id: str) -> List[VersionSnapshot]:
        items = self._filter(NS_VERSION, VersionSnapshot, project_id=project_id)
        return sorted(items, key=lambda v: v.created_at, reverse=True)

    def latest_version(self, project_id: str) -> Optional[VersionSnapshot]:
        items = self.list_versions(project_id)
        return items[0] if items else None

    # ── 审批流 ────────────────────────────────────────────────────────────
    def create_approval(
        self, project_id: str, title: str, requested_by: str, kind: str = "content"
    ) -> ApprovalRequest:
        with self._lock:
            req = ApprovalRequest(
                request_id=f"apr_{secrets.token_hex(8)}",
                project_id=project_id,
                title=title,
                kind=kind,
                requested_by=requested_by,
            )
            self._put(NS_APPROVAL, req.request_id, req)
            return req

    def get_approval(self, request_id: str) -> Optional[ApprovalRequest]:
        return self._get(NS_APPROVAL, request_id, ApprovalRequest)

    def list_approvals(self, project_id: str, status: Optional[str] = None) -> List[ApprovalRequest]:
        items = self._filter(NS_APPROVAL, ApprovalRequest, project_id=project_id)
        if status:
            items = [a for a in items if a.status == status]
        return sorted(items, key=lambda a: a.created_at, reverse=True)

    def decide_approval(
        self, request_id: str, reviewer: str, approve: bool, comment: str = ""
    ) -> Optional[ApprovalRequest]:
        with self._lock:
            req = self.get_approval(request_id)
            if req is None or req.status != "pending":
                return None
            req.status = "approved" if approve else "rejected"
            req.reviewer = reviewer
            req.decided_at = time.time()
            req.comment = comment
            self._put(NS_APPROVAL, request_id, req)
            return req

    def cancel_approval(self, request_id: str) -> Optional[ApprovalRequest]:
        with self._lock:
            req = self.get_approval(request_id)
            if req is None or req.status != "pending":
                return None
            req.status = "canceled"
            req.decided_at = time.time()
            self._put(NS_APPROVAL, request_id, req)
            return req

    # ── 发布排期 ──────────────────────────────────────────────────────────
    def create_schedule(
        self,
        project_id: str,
        channel: str,
        scheduled_at: float,
        created_by: str,
        payload: str = "{}",
    ) -> PublishSchedule:
        with self._lock:
            item = PublishSchedule(
                schedule_id=f"sch_{secrets.token_hex(8)}",
                project_id=project_id,
                channel=channel,
                scheduled_at=scheduled_at,
                payload=payload,
                created_by=created_by,
            )
            self._put(NS_SCHEDULE, item.schedule_id, item)
            return item

    def get_schedule(self, schedule_id: str) -> Optional[PublishSchedule]:
        return self._get(NS_SCHEDULE, schedule_id, PublishSchedule)

    def list_schedules(
        self, project_id: Optional[str] = None, due_before: Optional[float] = None
    ) -> List[PublishSchedule]:
        items = self._filter(NS_SCHEDULE, PublishSchedule)
        if project_id:
            items = [s for s in items if s.project_id == project_id]
        if due_before is not None:
            items = [s for s in items if s.scheduled_at <= due_before]
        return sorted(items, key=lambda s: s.scheduled_at)

    def mark_published(self, schedule_id: str, result: str = "") -> Optional[PublishSchedule]:
        with self._lock:
            item = self.get_schedule(schedule_id)
            if item is None or item.status != "pending":
                return None
            item.status = "published"
            item.executed_at = time.time()
            item.result = result
            self._put(NS_SCHEDULE, schedule_id, item)
            return item

    def mark_schedule_failed(self, schedule_id: str, result: str = "") -> Optional[PublishSchedule]:
        with self._lock:
            item = self.get_schedule(schedule_id)
            if item is None or item.status != "pending":
                return None
            item.status = "failed"
            item.executed_at = time.time()
            item.result = result
            self._put(NS_SCHEDULE, schedule_id, item)
            return item

    def cancel_schedule(self, schedule_id: str) -> Optional[PublishSchedule]:
        with self._lock:
            item = self.get_schedule(schedule_id)
            if item is None or item.status != "pending":
                return None
            item.status = "canceled"
            self._put(NS_SCHEDULE, schedule_id, item)
            return item

    # ── 维护 ──────────────────────────────────────────────────────────────
    def reset(self) -> None:
        """测试用：清空协作域数据。"""
        for ns in (NS_MEMBER, NS_SHARE, NS_VERSION, NS_APPROVAL, NS_SCHEDULE):
            self._db.clear(ns)


_store: Optional[CollabStore] = None


def get_collab_store() -> CollabStore:
    global _store
    if _store is None:
        _store = CollabStore()
    return _store


def reset_collab_store(db_path: Optional[Path] = None) -> None:
    """测试用：重置单例并清空数据。"""
    global _store
    _store = None
    Database.reset(db_path)