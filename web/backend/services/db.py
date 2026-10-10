# -*- coding: utf-8 -*-
# file: backend/services/db.py
# 作用：SQLite 持久化底座 —— 线程安全连接、schema 迁移、通用 KV/文档读写
# 说明：替代原先散落各模块的内存字典，使数据在进程重启后不丢失。
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

_DEFAULT_DIR = Path(__file__).resolve().parents[3] / "data"

_SCHEMA = """
-- 通用文档表：承载原先各模块的内存字典/列表
CREATE TABLE IF NOT EXISTS doc_store (
    namespace  TEXT NOT NULL,
    doc_id     TEXT NOT NULL,
    payload    TEXT NOT NULL,
    updated_at REAL NOT NULL,
    PRIMARY KEY (namespace, doc_id)
);
CREATE INDEX IF NOT EXISTS idx_doc_store_ns ON doc_store(namespace);

-- 列表型数据（如审计流水、调用留痕），按序号追加
CREATE TABLE IF NOT EXISTS event_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    namespace  TEXT NOT NULL,
    event_id   TEXT,
    payload    TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_log_ns ON event_log(namespace, id);
"""


class Database:
    """轻量 SQLite 封装：单连接 + 锁 + WAL，进程内共享。"""

    _instance: Optional["Database"] = None
    _instance_lock = threading.Lock()

    def __init__(self, db_path: Optional[Path] = None) -> None:
        if db_path is None:
            raw = os.environ.get("NOVA_DB_PATH")
            db_path = Path(raw) if raw else _DEFAULT_DIR / "nova.db"
        self._path = Path(db_path)
        if str(self._path) != ":memory:":
            self._path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self._path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    # ── 生命周期 ──────────────────────────────────────────────────────────
    @classmethod
    def instance(cls, db_path: Optional[Path] = None) -> "Database":
        """获取全局单例；传入 db_path 且与当前不同则重建（测试用）。"""
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = cls(db_path)
            elif db_path is not None and Path(db_path) != cls._instance.path:
                cls._instance.close()
                cls._instance = cls(db_path)
            return cls._instance

    @classmethod
    def reset(cls, db_path: Optional[Path] = None) -> None:
        """测试用：丢弃单例，下次 get 时重建。"""
        with cls._instance_lock:
            if cls._instance is not None:
                cls._instance.close()
                cls._instance = None

    def close(self) -> None:
        with self._lock:
            try:
                self._conn.close()
            except sqlite3.Error:
                pass

    @property
    def path(self) -> Path:
        return self._path

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            try:
                yield self._conn
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise

    # ── 文档型（key → JSON）───────────────────────────────────────────────
    def put(self, namespace: str, doc_id: str, payload: Dict[str, Any]) -> None:
        blob = json.dumps(payload, ensure_ascii=False)
        with self._tx() as conn:
            conn.execute(
                "INSERT INTO doc_store(namespace, doc_id, payload, updated_at) "
                "VALUES(?,?,?,?) "
                "ON CONFLICT(namespace, doc_id) DO UPDATE SET "
                "payload=excluded.payload, updated_at=excluded.updated_at",
                (namespace, doc_id, blob, time.time()),
            )

    def get(self, namespace: str, doc_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                "SELECT payload FROM doc_store WHERE namespace=? AND doc_id=?",
                (namespace, doc_id),
            ).fetchone()
        return json.loads(row["payload"]) if row else None

    def delete(self, namespace: str, doc_id: str) -> bool:
        with self._tx() as conn:
            cur = conn.execute(
                "DELETE FROM doc_store WHERE namespace=? AND doc_id=?",
                (namespace, doc_id),
            )
        return cur.rowcount > 0

    def list(self, namespace: str) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT doc_id, payload FROM doc_store WHERE namespace=? ORDER BY doc_id",
                (namespace,),
            ).fetchall()
        out: List[Dict[str, Any]] = []
        for row in rows:
            item = json.loads(row["payload"])
            item.setdefault("_id", row["doc_id"])
            out.append(item)
        return out

    def clear(self, namespace: str) -> None:
        with self._tx() as conn:
            conn.execute("DELETE FROM doc_store WHERE namespace=?", (namespace,))

    # ── 事件型（追加流）───────────────────────────────────────────────────
    def append_event(
        self, namespace: str, payload: Dict[str, Any], event_id: Optional[str] = None
    ) -> int:
        blob = json.dumps(payload, ensure_ascii=False)
        with self._tx() as conn:
            cur = conn.execute(
                "INSERT INTO event_log(namespace, event_id, payload, created_at) VALUES(?,?,?,?)",
                (namespace, event_id, blob, time.time()),
            )
        return int(cur.lastrowid or 0)

    def read_events(
        self, namespace: str, limit: int = 1000, newest_first: bool = False
    ) -> List[Dict[str, Any]]:
        order = "DESC" if newest_first else "ASC"
        with self._lock:
            rows = self._conn.execute(
                f"SELECT event_id, payload, created_at FROM event_log "
                f"WHERE namespace=? ORDER BY id {order} LIMIT ?",
                (namespace, int(limit)),
            ).fetchall()
        out: List[Dict[str, Any]] = []
        for row in rows:
            item = json.loads(row["payload"])
            if row["event_id"]:
                item.setdefault("_id", row["event_id"])
            item.setdefault("_created_at", row["created_at"])
            out.append(item)
        return out

    def count_events(self, namespace: str) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) AS n FROM event_log WHERE namespace=?", (namespace,)
            ).fetchone()
        return int(row["n"]) if row else 0

    def trim_events(self, namespace: str, keep: int) -> int:
        """仅保留最近 keep 条，返回删除条数。"""
        with self._tx() as conn:
            cur = conn.execute(
                "DELETE FROM event_log WHERE namespace=? AND id NOT IN ("
                "SELECT id FROM event_log WHERE namespace=? ORDER BY id DESC LIMIT ?)",
                (namespace, namespace, int(keep)),
            )
        return cur.rowcount


def get_db(db_path: Optional[Path] = None) -> Database:
    """便捷入口：获取全局数据库实例。"""
    return Database.instance(db_path)