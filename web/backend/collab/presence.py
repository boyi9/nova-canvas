# -*- coding: utf-8 -*-
# file: backend/collab/presence.py
# 作用：实时协同 Presence 服务 —— 在线状态/输入指示/光标位置广播
# 说明：基于 WebSocket 的轻量级 presence 总线，可对接 yjs/crisp 等 CRDT。
from __future__ import annotations

import json
import secrets
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set


@dataclass
class PresenceSession:
    session_id: str
    user_id: str
    user_name: str
    project_id: str
    role: str = "viewer"
    cursor: Optional[Dict[str, Any]] = None
    typing: bool = False
    last_active: float = field(default_factory=time.time)
    connected_at: float = field(default_factory=time.time)


class PresenceError(ValueError):
    """Presence 操作非法。"""


class PresenceBus:
    """
    Presence 总线：维护每个项目的在线会话集合。
    生产环境可替换为 Redis Pub/Sub 或 yjs WebSocketProvider。
    """

    def __init__(self, idle_timeout_s: float = 300.0) -> None:
        self._lock = threading.RLock()
        self._sessions: Dict[str, PresenceSession] = {}  # session_id -> session
        self._project_index: Dict[str, Set[str]] = {}    # project_id -> {session_id}
        self._subscribers: Dict[str, List[Any]] = {}     # project_id -> [callback]
        self.idle_timeout_s = idle_timeout_s

    # ── 会话管理 ────────────────────────────────────────────────────
    def join(
        self,
        user_id: str,
        user_name: str,
        project_id: str,
        role: str = "viewer",
    ) -> PresenceSession:
        if not user_id or not project_id:
            raise PresenceError("user_id 和 project_id 不能为空")
        with self._lock:
            self._gc_locked()
            session = PresenceSession(
                session_id=f"pres_{secrets.token_hex(8)}",
                user_id=user_id,
                user_name=user_name,
                project_id=project_id,
                role=role,
            )
            self._sessions[session.session_id] = session
            self._project_index.setdefault(project_id, set()).add(session.session_id)
            self._broadcast(project_id, {
                "type": "member_joined",
                "session_id": session.session_id,
                "user_id": user_id,
                "user_name": user_name,
                "role": role,
            })
            return session

    def leave(self, session_id: str) -> Optional[PresenceSession]:
        with self._lock:
            session = self._sessions.pop(session_id, None)
            if session is None:
                return None
            pids = self._project_index.get(session.project_id, set())
            pids.discard(session_id)
            if not pids:
                self._project_index.pop(session.project_id, None)
            self._broadcast(session.project_id, {
                "type": "member_left",
                "session_id": session_id,
                "user_id": session.user_id,
            })
            return session

    # ── 状态更新 ────────────────────────────────────────────────────
    def update_cursor(
        self, session_id: str, cursor: Dict[str, Any]
    ) -> Optional[PresenceSession]:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            session.cursor = cursor
            session.last_active = time.time()
            self._broadcast(session.project_id, {
                "type": "cursor_moved",
                "session_id": session_id,
                "user_id": session.user_id,
                "cursor": cursor,
            })
            return session

    def set_typing(self, session_id: str, typing: bool) -> Optional[PresenceSession]:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            session.typing = typing
            session.last_active = time.time()
            self._broadcast(session.project_id, {
                "type": "typing",
                "session_id": session_id,
                "user_id": session.user_id,
                "typing": typing,
            })
            return session

    # ── 查询 ────────────────────────────────────────────────────────
    def get_session(self, session_id: str) -> Optional[PresenceSession]:
        with self._lock:
            return self._sessions.get(session_id)

    def list_project(self, project_id: str) -> List[PresenceSession]:
        with self._lock:
            self._gc_locked()
            ids = self._project_index.get(project_id, set())
            return [self._sessions[i] for i in ids if i in self._sessions]

    def list_all(self) -> List[PresenceSession]:
        with self._lock:
            return list(self._sessions.values())

    # ── 订阅 ────────────────────────────────────────────────────────
    def subscribe(self, project_id: str, callback: Any) -> None:
        """订阅项目事件（回调函数接收 dict 事件）。"""
        with self._lock:
            self._subscribers.setdefault(project_id, []).append(callback)

    def unsubscribe(self, project_id: str, callback: Any) -> None:
        with self._lock:
            subs = self._subscribers.get(project_id, [])
            if callback in subs:
                subs.remove(callback)

    # ── 内部 ──────────────────────────────────────────────────────
    def _broadcast(self, project_id: str, event: Dict[str, Any]) -> None:
        for cb in self._subscribers.get(project_id, []):
            try:
                cb(event)
            except Exception:
                pass

    def _gc_locked(self) -> None:
        """清理超时会话。"""
        now = time.time()
        expired = [
            sid for sid, s in self._sessions.items()
            if now - s.last_active > self.idle_timeout_s
        ]
        for sid in expired:
            self.leave(sid)


_bus: Optional[PresenceBus] = None


def get_presence_bus() -> PresenceBus:
    global _bus
    if _bus is None:
        _bus = PresenceBus()
    return _bus


def reset_presence_bus() -> None:
    """测试用：重置总线。"""
    global _bus
    _bus = None