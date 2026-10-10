# -*- coding: utf-8 -*-
# tests/test_projects_api.py —— P2-3 项目持久化
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from web.backend.main import app
from web.backend.projects import (
    get_project_store,
    issue_token,
    reset_project_store,
    verify_token,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean(tmp_path):
    reset_project_store(data_dir=tmp_path)
    yield
    reset_project_store()


AUTH = {"Authorization": f"Bearer {issue_token('alice')}"}
AUTH_B = {"Authorization": f"Bearer {issue_token('bob')}"}


class TestToken:
    def test_issue_verify(self):
        t = issue_token("u123")
        assert t.startswith("tok_")
        assert verify_token(f"Bearer {t}") == "u123"

    def test_invalid(self):
        assert verify_token(None) is None
        assert verify_token("Bearer plain") is None
        assert verify_token("Bearer tok_") is None
        assert verify_token("Basic tok_x") is None


class TestStore:
    def test_persistence_across_instances(self, tmp_path):
        store1 = get_project_store(data_dir=tmp_path)
        p = store1.create_project("alice", "海报项目", scene="ecommerce")
        # 新实例（模拟重启）
        from web.backend.projects.store import ProjectStore

        store2 = ProjectStore(data_dir=tmp_path)
        loaded = store2.get_project(p.id, "alice")
        assert loaded is not None
        assert loaded.name == "海报项目"
        # 文件确实落盘
        f = tmp_path / "store.json"
        assert f.exists()
        raw = json.loads(f.read_text(encoding="utf-8"))
        assert any(item["id"] == p.id for item in raw["projects"])

    def test_owner_isolation(self, tmp_path):
        store = get_project_store(data_dir=tmp_path)
        p = store.create_project("alice", "A项目")
        assert store.get_project(p.id, "bob") is None
        assert store.delete_project(p.id, "bob") is False
        assert store.delete_project(p.id, "alice") is True


class TestApi:
    def test_unauthorized(self):
        r = client.get("/api/projects")
        assert r.status_code == 401
        r2 = client.get("/api/projects", headers={"Authorization": "Bearer bad"})
        assert r2.status_code == 401

    def test_full_crud(self):
        # 创建
        r = client.post(
            "/api/projects",
            json={"name": "新品海报", "scene": "ecommerce", "description": "618 大促"},
            headers=AUTH,
        )
        assert r.status_code == 200
        pid = r.json()["id"]
        assert r.json()["name"] == "新品海报"

        # 列表
        rl = client.get("/api/projects", headers=AUTH).json()
        assert rl["total"] == 1
        assert rl["projects"][0]["id"] == pid

        # 更新画布数据
        canvas = json.dumps([{"id": "n1", "type": "image"}])
        ru = client.put(
            f"/api/projects/{pid}",
            json={"canvas_data": canvas},
            headers=AUTH,
        )
        assert ru.status_code == 200
        assert ru.json()["canvas_data"] == canvas

        # 别人不可见
        rl_b = client.get("/api/projects", headers=AUTH_B).json()
        assert rl_b["total"] == 0
        rb = client.get(f"/api/projects/{pid}", headers=AUTH_B)
        # PUT/DELETE 无权限 → 404
        r_del_b = client.delete(f"/api/projects/{pid}", headers=AUTH_B)
        assert r_del_b.status_code == 404

        # 删除
        rd = client.delete(f"/api/projects/{pid}", headers=AUTH)
        assert rd.status_code == 200
        rl2 = client.get("/api/projects", headers=AUTH).json()
        assert rl2["total"] == 0

    def test_update_not_found(self):
        r = client.put(
            "/api/projects/prj_none", json={"name": "x"}, headers=AUTH
        )
        assert r.status_code == 404

    def test_pagination(self):
        for i in range(5):
            client.post("/api/projects", json={"name": f"P{i}"}, headers=AUTH)
        r = client.get("/api/projects?limit=2&offset=2", headers=AUTH).json()
        assert len(r["projects"]) == 2
        assert r["total"] == 5
