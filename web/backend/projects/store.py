# -*- coding: utf-8 -*-
# file: backend/projects/store.py
# 作用：项目持久化 —— JSON 文件落盘（重启不丢），Bearer token 鉴权（演示）
from __future__ import annotations

import json
import secrets
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

_DEFAULT_DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "projects"


@dataclass
class Project:
    id: str
    name: str
    scene: str = ""
    description: str = ""
    canvas_data: str = "[]"
    status: str = "active"  # active | archived
    owner_id: str = ""
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Dict) -> "Project":
        return cls(**{k: d[k] for k in cls.__dataclass_fields__ if k in d})


# 演示 token：自编码格式 tok_<user_id>（无服务端会话表，重启/多进程一致）
def issue_token(user_id: str) -> str:
    return f"tok_{user_id}"


def verify_token(authorization: Optional[str]) -> Optional[str]:
    """从 Authorization: Bearer <token> 解出 user_id；无效返回 None。"""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization[7:].strip()
    if token.startswith("tok_") and len(token) > 4:
        return token[4:]
    return None


class ProjectStore:
    """线程安全的项目存储；数据落 JSON 文件（{data_dir}/store.json）。"""

    def __init__(self, data_dir: Optional[Path] = None) -> None:
        self._lock = threading.RLock()
        self._data_dir = Path(data_dir) if data_dir else _DEFAULT_DATA_DIR
        self._file = self._data_dir / "store.json"
        self._projects: Dict[str, Project] = {}
        self._load()

    def _load(self) -> None:
        if self._file.exists():
            try:
                raw = json.loads(self._file.read_text(encoding="utf-8"))
                for item in raw.get("projects", []):
                    p = Project.from_dict(item)
                    self._projects[p.id] = p
            except (json.JSONDecodeError, TypeError, KeyError):
                # 文件损坏则从空开始（演示容错）
                self._projects = {}

    def _save(self) -> None:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        payload = {"projects": [p.to_dict() for p in self._projects.values()]}
        self._file.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    # ── CRUD ──────────────────────────────────────────────────────────────
    def list_projects(
        self, owner_id: str, limit: int = 20, offset: int = 0
    ) -> tuple[List[Project], int]:
        with self._lock:
            owned = [p for p in self._projects.values() if p.owner_id == owner_id]
            owned.sort(key=lambda x: x.created_at, reverse=True)
            total = len(owned)
            return owned[offset : offset + limit], total

    def get_project(self, project_id: str, owner_id: str) -> Optional[Project]:
        with self._lock:
            p = self._projects.get(project_id)
            if p is None or p.owner_id != owner_id:
                return None
            return p

    def create_project(
        self,
        owner_id: str,
        name: str,
        scene: str = "",
        description: str = "",
    ) -> Project:
        with self._lock:
            pid = f"prj_{secrets.token_hex(8)}"
            p = Project(
                id=pid,
                name=name,
                scene=scene,
                description=description,
                owner_id=owner_id,
            )
            self._projects[pid] = p
            self._save()
            return p

    def update_project(
        self,
        project_id: str,
        owner_id: str,
        name: Optional[str] = None,
        canvas_data: Optional[str] = None,
        status: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Optional[Project]:
        with self._lock:
            p = self.get_project(project_id, owner_id)
            if p is None:
                return None
            if name is not None:
                p.name = name
            if canvas_data is not None:
                p.canvas_data = canvas_data
            if status is not None:
                p.status = status
            if description is not None:
                p.description = description
            p.updated_at = time.time()
            self._save()
            return p

    def delete_project(self, project_id: str, owner_id: str) -> bool:
        with self._lock:
            p = self._projects.get(project_id)
            if p is None or p.owner_id != owner_id:
                return False
            del self._projects[project_id]
            self._save()
            return True


_store: Optional[ProjectStore] = None


def get_project_store(data_dir: Optional[Path] = None) -> ProjectStore:
    global _store
    if _store is None:
        _store = ProjectStore(data_dir=data_dir)
    return _store


def reset_project_store(data_dir: Optional[Path] = None) -> None:
    """测试用：重置模块级存储（可指定临时目录）。"""
    global _store
    _store = ProjectStore(data_dir=data_dir) if data_dir else None
