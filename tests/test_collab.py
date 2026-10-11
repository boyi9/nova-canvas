# -*- coding: utf-8 -*-
# tests/test_collab.py —— P2 协作六件套：成员/RBAC、分享、版本、审批、排期
from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from web.backend.collab import Permission, can, missing, reset_collab_store, reset_presence_bus
from web.backend.collab.permissions import RED_LINE_PERMISSIONS
from web.backend.main import create_app
from web.backend.services.db import Database

OWNER = {"Authorization": "Bearer tok_alice"}
EDITOR = {"Authorization": "Bearer tok_bob"}
VIEWER = {"Authorization": "Bearer tok_carol"}
STRANGER = {"Authorization": "Bearer tok_dave"}


@pytest.fixture()
def client():
    Database.reset()
    reset_collab_store()
    reset_presence_bus()
    app = create_app()
    with TestClient(app) as c:
        _seed(c)
        yield c
    reset_collab_store()
    reset_presence_bus()
    Database.reset()


def _seed(c: TestClient) -> None:
    """建立项目并分配三种角色（创建者已自动是 owner）。"""
    r = c.post("/api/projects", json={"name": "618 大促"}, headers=OWNER)
    assert r.status_code == 200
    pid = r.json()["id"]
    # 创建者 alice 已由 projects_api 自动授予 owner
    c.post(f"/api/collab/{pid}/members", json={"user_id": "bob", "role": "editor"}, headers=OWNER)
    c.post(f"/api/collab/{pid}/members", json={"user_id": "carol", "role": "viewer"}, headers=OWNER)


def _pid(c: TestClient) -> str:
    return c.get("/api/projects", headers=OWNER).json()["projects"][0]["id"]


class TestPermissionMatrix:
    def test_viewer_cannot_write(self):
        assert can("viewer", Permission.PROJECT_READ) is True
        assert can("viewer", Permission.PROJECT_WRITE) is False

    def test_editor_can_write_but_not_publish(self):
        assert can("editor", Permission.PROJECT_WRITE) is True
        assert can("editor", Permission.PUBLISH_EXECUTE) is False

    def test_owner_can_everything(self):
        for p in (
            Permission.PROJECT_DELETE,
            Permission.MEMBER_MANAGE,
            Permission.SHARE_MANAGE,
            Permission.VERSION_ROLLBACK,
            Permission.PUBLISH_EXECUTE,
        ):
            assert can("owner", p) is True

    def test_unknown_role_has_no_permission(self):
        assert can("ghost", Permission.PROJECT_READ) is False

    def test_missing_lists_gaps(self):
        assert missing("editor", [Permission.PROJECT_READ, Permission.PUBLISH_EXECUTE]) == [
            Permission.PUBLISH_EXECUTE
        ]

    def test_red_line_defined(self):
        assert Permission.PUBLISH_EXECUTE in RED_LINE_PERMISSIONS
        assert Permission.PROJECT_DELETE in RED_LINE_PERMISSIONS
        assert Permission.PROJECT_READ not in RED_LINE_PERMISSIONS


class TestMembers:
    def test_list_members(self, client):
        pid = _pid(client)
        r = client.get(f"/api/collab/{pid}/members", headers=OWNER)
        assert r.status_code == 200
        assert r.json()["total"] == 3

    def test_stranger_forbidden(self, client):
        pid = _pid(client)
        assert client.get(f"/api/collab/{pid}/members", headers=STRANGER).status_code == 403

    def test_unauthenticated(self, client):
        pid = _pid(client)
        assert client.get(f"/api/collab/{pid}/members").status_code == 401

    def test_editor_cannot_add_member(self, client):
        pid = _pid(client)
        r = client.post(
            f"/api/collab/{pid}/members", json={"user_id": "eve", "role": "editor"}, headers=EDITOR
        )
        assert r.status_code == 403

    def test_invalid_role_rejected(self, client):
        pid = _pid(client)
        r = client.post(
            f"/api/collab/{pid}/members", json={"user_id": "eve", "role": "superuser"}, headers=OWNER
        )
        assert r.status_code == 400

    def test_change_role(self, client):
        pid = _pid(client)
        r = client.patch(f"/api/collab/{pid}/members/bob", json={"role": "viewer"}, headers=OWNER)
        assert r.status_code == 200
        assert r.json()["role"] == "viewer"

    def test_cannot_remove_self(self, client):
        pid = _pid(client)
        r = client.delete(f"/api/collab/{pid}/members/alice", headers=OWNER)
        assert r.status_code == 400

    def test_remove_member(self, client):
        pid = _pid(client)
        assert client.delete(f"/api/collab/{pid}/members/bob", headers=OWNER).status_code == 200
        assert client.get(f"/api/collab/{pid}/members", headers=OWNER).json()["total"] == 2

    def test_remove_missing_member_404(self, client):
        pid = _pid(client)
        assert client.delete(f"/api/collab/{pid}/members/ghost", headers=OWNER).status_code == 404


class TestShareLinks:
    def test_owner_creates_link(self, client):
        pid = _pid(client)
        r = client.post(f"/api/collab/{pid}/shares", json={"permission": "viewer"}, headers=OWNER)
        assert r.status_code == 200
        body = r.json()
        assert body["token"]
        assert body["url"] == f"/share/{body['token']}"

    def test_editor_cannot_create_link(self, client):
        pid = _pid(client)
        assert client.post(f"/api/collab/{pid}/shares", json={}, headers=EDITOR).status_code == 403

    def test_share_permission_must_be_viewer_or_editor(self, client):
        pid = _pid(client)
        r = client.post(f"/api/collab/{pid}/shares", json={"permission": "owner"}, headers=OWNER)
        assert r.status_code == 400

    def test_public_access(self, client):
        pid = _pid(client)
        token = client.post(f"/api/collab/{pid}/shares", json={}, headers=OWNER).json()["token"]
        r = client.get(f"/api/collab/share/{token}")
        assert r.status_code == 200
        assert r.json()["project_id"] == pid

    def test_invalid_token_404(self, client):
        assert client.get("/api/collab/share/bogus").status_code == 404

    def test_revoked_link_gone(self, client):
        pid = _pid(client)
        share = client.post(f"/api/collab/{pid}/shares", json={}, headers=OWNER).json()
        client.delete(f"/api/collab/{pid}/shares/{share['share_id']}", headers=OWNER)
        assert client.get(f"/api/collab/share/{share['token']}").status_code == 410

    def test_expired_link_gone(self, client):
        pid = _pid(client)
        share = client.post(
            f"/api/collab/{pid}/shares", json={"expires_in_s": 1}, headers=OWNER
        ).json()
        # 直接改库模拟过期
        from web.backend.collab import get_collab_store

        store = get_collab_store()
        link = store.get_share(share["share_id"])
        link.expires_at = time.time() - 10
        store._put("collab.share", link.share_id, link)
        assert client.get(f"/api/collab/share/{share['token']}").status_code == 410

    def test_view_count_increments(self, client):
        pid = _pid(client)
        share = client.post(f"/api/collab/{pid}/shares", json={}, headers=OWNER).json()
        client.get(f"/api/collab/share/{share['token']}")
        client.get(f"/api/collab/share/{share['token']}")
        listing = client.get(f"/api/collab/{pid}/shares", headers=OWNER).json()["shares"]
        assert listing[0]["view_count"] == 2

    def test_list_shares_marks_red_line(self, client):
        pid = _pid(client)
        client.post(f"/api/collab/{pid}/shares", json={}, headers=OWNER)
        s = client.get(f"/api/collab/{pid}/shares", headers=OWNER).json()["shares"][0]
        assert s["red_line"] is True


class TestVersions:
    def test_create_and_list(self, client):
        pid = _pid(client)
        r = client.post(
            f"/api/collab/{pid}/versions", json={"canvas_data": '{"n":1}', "note": "初版"}, headers=EDITOR
        )
        assert r.status_code == 200
        assert r.json()["version_id"].startswith(pid)
        listing = client.get(f"/api/collab/{pid}/versions", headers=VIEWER)
        assert listing.json()["total"] == 1
        assert listing.json()["versions"][0]["note"] == "初版"

    def test_viewer_cannot_create(self, client):
        pid = _pid(client)
        r = client.post(f"/api/collab/{pid}/versions", json={"canvas_data": "{}"}, headers=VIEWER)
        assert r.status_code == 403

    def test_version_detail_includes_canvas(self, client):
        pid = _pid(client)
        vid = client.post(
            f"/api/collab/{pid}/versions", json={"canvas_data": '{"secret":1}'}, headers=OWNER
        ).json()["version_id"]
        r = client.get(f"/api/collab/{pid}/versions/{vid}", headers=VIEWER)
        assert r.json()["canvas_data"] == '{"secret":1}'

    def test_rollback_owner_only(self, client):
        pid = _pid(client)
        vid = client.post(
            f"/api/collab/{pid}/versions", json={"canvas_data": "v1"}, headers=OWNER
        ).json()["version_id"]
        assert client.post(
            f"/api/collab/{pid}/rollback", json={"version_id": vid}, headers=EDITOR
        ).status_code == 403

    def test_rollback_creates_new_snapshot(self, client):
        pid = _pid(client)
        v1 = client.post(f"/api/collab/{pid}/versions", json={"canvas_data": "A"}, headers=OWNER).json()
        client.post(f"/api/collab/{pid}/versions", json={"canvas_data": "B"}, headers=OWNER)
        r = client.post(
            f"/api/collab/{pid}/rollback", json={"version_id": v1["version_id"]}, headers=OWNER
        )
        assert r.status_code == 200
        body = r.json()
        assert body["restored_from"] == v1["version_id"]
        assert body["red_line"] is True
        # 回滚留痕：版本数增加到 3
        assert client.get(f"/api/collab/{pid}/versions", headers=OWNER).json()["total"] == 3

    def test_rollback_unknown_version(self, client):
        pid = _pid(client)
        r = client.post(
            f"/api/collab/{pid}/rollback", json={"version_id": "nope"}, headers=OWNER
        )
        assert r.status_code == 404


class TestApprovals:
    def test_editor_submits(self, client):
        pid = _pid(client)
        r = client.post(f"/api/collab/{pid}/approvals", json={"title": "主图上线"}, headers=EDITOR)
        assert r.status_code == 200
        assert r.json()["status"] == "pending"

    def test_viewer_cannot_submit(self, client):
        pid = _pid(client)
        assert client.post(
            f"/api/collab/{pid}/approvals", json={"title": "x"}, headers=VIEWER
        ).status_code == 403

    def test_editor_cannot_review_own_request(self, client):
        """编辑提交、owner 审批 —— editor 不具审批权。"""
        pid = _pid(client)
        rid = client.post(
            f"/api/collab/{pid}/approvals", json={"title": "x"}, headers=EDITOR
        ).json()["request_id"]
        r = client.post(
            f"/api/collab/{pid}/approvals/{rid}/decision", json={"approve": True}, headers=EDITOR
        )
        assert r.status_code == 403

    def test_owner_approves(self, client):
        pid = _pid(client)
        rid = client.post(
            f"/api/collab/{pid}/approvals", json={"title": "x"}, headers=EDITOR
        ).json()["request_id"]
        r = client.post(
            f"/api/collab/{pid}/approvals/{rid}/decision",
            json={"approve": True, "comment": "可以上线"},
            headers=OWNER,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "approved"

    def test_reject(self, client):
        pid = _pid(client)
        rid = client.post(
            f"/api/collab/{pid}/approvals", json={"title": "x"}, headers=EDITOR
        ).json()["request_id"]
        r = client.post(
            f"/api/collab/{pid}/approvals/{rid}/decision",
            json={"approve": False, "comment": "打回"},
            headers=OWNER,
        )
        assert r.json()["status"] == "rejected"

    def test_double_decision_rejected(self, client):
        pid = _pid(client)
        rid = client.post(
            f"/api/collab/{pid}/approvals", json={"title": "x"}, headers=EDITOR
        ).json()["request_id"]
        client.post(f"/api/collab/{pid}/approvals/{rid}/decision", json={"approve": True}, headers=OWNER)
        again = client.post(
            f"/api/collab/{pid}/approvals/{rid}/decision", json={"approve": True}, headers=OWNER
        )
        assert again.status_code == 404

    def test_filter_by_status(self, client):
        pid = _pid(client)
        rid = client.post(
            f"/api/collab/{pid}/approvals", json={"title": "a"}, headers=EDITOR
        ).json()["request_id"]
        client.post(f"/api/collab/{pid}/approvals/{rid}/decision", json={"approve": True}, headers=OWNER)
        client.post(f"/api/collab/{pid}/approvals", json={"title": "b"}, headers=EDITOR)
        pending = client.get(f"/api/collab/{pid}/approvals?status=pending", headers=OWNER).json()
        assert pending["total"] == 1
        approved = client.get(f"/api/collab/{pid}/approvals?status=approved", headers=OWNER).json()
        assert approved["total"] == 1

    def test_cancel(self, client):
        pid = _pid(client)
        rid = client.post(
            f"/api/collab/{pid}/approvals", json={"title": "x"}, headers=EDITOR
        ).json()["request_id"]
        r = client.post(f"/api/collab/{pid}/approvals/{rid}/cancel", headers=EDITOR)
        assert r.json()["status"] == "canceled"


class TestSchedules:
    def test_owner_creates(self, client):
        pid = _pid(client)
        r = client.post(
            f"/api/collab/{pid}/schedules",
            json={"channel": "douyin", "scheduled_at": time.time() + 3600},
            headers=OWNER,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "pending"

    def test_editor_cannot_schedule(self, client):
        pid = _pid(client)
        r = client.post(
            f"/api/collab/{pid}/schedules",
            json={"channel": "douyin", "scheduled_at": time.time() + 3600},
            headers=EDITOR,
        )
        assert r.status_code == 403

    def test_invalid_timestamp(self, client):
        pid = _pid(client)
        r = client.post(
            f"/api/collab/{pid}/schedules", json={"channel": "douyin", "scheduled_at": 0}, headers=OWNER
        )
        assert r.status_code == 400

    def test_list_includes_now_for_client_clock(self, client):
        pid = _pid(client)
        r = client.get(f"/api/collab/{pid}/schedules", headers=OWNER).json()
        assert "now" in r

    def test_marked_red_line(self, client):
        pid = _pid(client)
        client.post(
            f"/api/collab/{pid}/schedules",
            json={"channel": "douyin", "scheduled_at": time.time() + 60},
            headers=OWNER,
        )
        s = client.get(f"/api/collab/{pid}/schedules", headers=OWNER).json()["schedules"][0]
        assert s["red_line"] is True

    def test_execute_requires_owner(self, client):
        pid = _pid(client)
        sid = client.post(
            f"/api/collab/{pid}/schedules",
            json={"channel": "douyin", "scheduled_at": time.time() + 60},
            headers=OWNER,
        ).json()["schedule_id"]
        assert client.post(f"/api/collab/schedules/{sid}/execute", headers=EDITOR).status_code == 403

    def test_execute_is_idempotent(self, client):
        pid = _pid(client)
        sid = client.post(
            f"/api/collab/{pid}/schedules",
            json={"channel": "douyin", "scheduled_at": time.time() + 60},
            headers=OWNER,
        ).json()["schedule_id"]
        assert client.post(f"/api/collab/schedules/{sid}/execute", headers=OWNER).status_code == 200
        # 第二次应冲突，不得重复发布
        assert client.post(f"/api/collab/schedules/{sid}/execute", headers=OWNER).status_code == 409

    def test_cancel(self, client):
        pid = _pid(client)
        sid = client.post(
            f"/api/collab/{pid}/schedules",
            json={"channel": "douyin", "scheduled_at": time.time() + 60},
            headers=OWNER,
        ).json()["schedule_id"]
        assert client.post(f"/api/collab/{pid}/schedules/{sid}/cancel", headers=OWNER).json()["status"] == "canceled"


class TestPersistence:
    def test_collaboration_survives_restart(self, tmp_path, monkeypatch):
        monkeypatch.setenv("NOVA_DB_PATH", str(tmp_path / "collab.db"))
        Database.reset()
        reset_collab_store()
        from web.backend.collab import get_collab_store

        s1 = get_collab_store()
        s1.add_member("pX", "u1", "owner")
        v = s1.create_version("pX", "u1", "canvas", note="n1")
        Database.reset()
        reset_collab_store()

        s2 = get_collab_store()
        assert s2.role_of("pX", "u1") == "owner"
        assert s2.get_version(v.version_id) is not None


class TestPresence:
    def test_join_and_list(self, client):
        pid = _pid(client)
        r = client.post(
            f"/api/collab/{pid}/presence/join",
            json={"user_name": "Alice"},
            headers=OWNER,
        )
        assert r.status_code == 200
        assert r.json()["user_id"] == "alice"
        # 在线列表
        lst = client.get(f"/api/collab/{pid}/presence", headers=OWNER).json()
        assert lst["count"] == 1
        assert lst["online"][0]["user_name"] == "Alice"

    def test_stranger_cannot_join(self, client):
        pid = _pid(client)
        assert client.post(
            f"/api/collab/{pid}/presence/join",
            json={"user_name": "Dave"},
            headers=STRANGER,
        ).status_code == 403

    def test_unauthenticated_rejected(self, client):
        pid = _pid(client)
        assert client.post(
            f"/api/collab/{pid}/presence/join",
            json={"user_name": "Anon"},
        ).status_code == 401

    def test_cursor_update(self, client):
        pid = _pid(client)
        client.post(
            f"/api/collab/{pid}/presence/join",
            json={"user_name": "Alice"},
            headers=OWNER,
        )
        r = client.post(
            f"/api/collab/{pid}/presence/cursor",
            json={"x": 100.0, "y": 200.0, "zoom": 1.5},
            headers=OWNER,
        )
        assert r.status_code == 200
        assert r.json()["cursor"] == {"x": 100.0, "y": 200.0, "zoom": 1.5}
        # 列表应包含光标
        lst = client.get(f"/api/collab/{pid}/presence", headers=OWNER).json()
        assert lst["online"][0]["cursor"]["x"] == 100.0

    def test_typing_toggle(self, client):
        pid = _pid(client)
        client.post(
            f"/api/collab/{pid}/presence/join",
            json={"user_name": "Alice"},
            headers=OWNER,
        )
        r = client.post(
            f"/api/collab/{pid}/presence/typing",
            json={"typing": True},
            headers=OWNER,
        )
        assert r.status_code == 200
        assert r.json()["typing"] is True
        lst = client.get(f"/api/collab/{pid}/presence", headers=OWNER).json()
        assert lst["online"][0]["typing"] is True

    def test_multi_user_presence(self, client):
        pid = _pid(client)
        client.post(
            f"/api/collab/{pid}/presence/join",
            json={"user_name": "Alice"},
            headers=OWNER,
        )
        client.post(
            f"/api/collab/{pid}/presence/join",
            json={"user_name": "Bob"},
            headers=EDITOR,
        )
        client.post(
            f"/api/collab/{pid}/presence/join",
            json={"user_name": "Carol"},
            headers=VIEWER,
        )
        lst = client.get(f"/api/collab/{pid}/presence", headers=OWNER).json()
        assert lst["count"] == 3
        names = {m["user_name"] for m in lst["online"]}
        assert names == {"Alice", "Bob", "Carol"}

    def test_leave_removes_from_list(self, client):
        pid = _pid(client)
        client.post(
            f"/api/collab/{pid}/presence/join",
            json={"user_name": "Alice"},
            headers=OWNER,
        )
        assert client.get(f"/api/collab/{pid}/presence", headers=OWNER).json()["count"] == 1
        r = client.post(f"/api/collab/{pid}/presence/leave", headers=OWNER)
        assert r.status_code == 200
        assert client.get(f"/api/collab/{pid}/presence", headers=OWNER).json()["count"] == 0

    def test_cursor_before_join_404(self, client):
        pid = _pid(client)
        assert client.post(
            f"/api/collab/{pid}/presence/cursor",
            json={"x": 1.0, "y": 1.0},
            headers=OWNER,
        ).status_code == 404

    def test_same_user_reuses_session(self, client):
        pid = _pid(client)
        j1 = client.post(
            f"/api/collab/{pid}/presence/join",
            json={"user_name": "Alice"},
            headers=OWNER,
        ).json()
        # 第二次 join 会创建新会话，但 _presence_session 取第一个
        j2 = client.post(
            f"/api/collab/{pid}/presence/join",
            json={"user_name": "Alice"},
            headers=OWNER,
        ).json()
        assert j1["session_id"] != j2["session_id"]

    def test_presence_bus_unit(self):
        from web.backend.collab import get_presence_bus

        bus = get_presence_bus()
        s = bus.join("u1", "Alice", "p1", "editor")
        assert s.user_id == "u1"
        assert s.role == "editor"
        # 更新光标
        bus.update_cursor(s.session_id, {"x": 10, "y": 20})
        assert bus.get_session(s.session_id).cursor == {"x": 10, "y": 20}
        # 订阅广播
        events = []
        bus.subscribe("p1", events.append)
        bus.set_typing(s.session_id, True)
        assert any(e["type"] == "typing" for e in events)
        # 离开
        bus.leave(s.session_id)
        assert bus.get_session(s.session_id) is None
        assert bus.list_project("p1") == []

    def test_presence_invalid_params(self):
        from web.backend.collab import PresenceError, get_presence_bus

        bus = get_presence_bus()
        with pytest.raises(PresenceError):
            bus.join("", "Alice", "p1")
        with pytest.raises(PresenceError):
            bus.join("u1", "Alice", "")
        reset_collab_store()