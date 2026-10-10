# -*- coding: utf-8 -*-
# file: tests/test_pro_router.py
# 作用：P1-3 pro_router 接真 pipeline_gateway / scheduler / ledger
import pytest
from fastapi.testclient import TestClient

from web.backend.main import create_app
from web.backend.pro import ledger
from web.backend.routers.pro_router import reset_pro_state


@pytest.fixture()
def client():
    reset_pro_state()
    ledger.reset_ledger()
    app = create_app()
    with TestClient(app) as c:
        yield c
    reset_pro_state()
    ledger.reset_ledger()


def test_pipeline_job_happy_path(client):
    resp = client.post(
        "/api/pro/pipeline/job",
        json={
            "pipeline": "nuke",
            "shot_id": "sh010",
            "version": "v001",
            "template": "basic_comp",
            "actions": ["generate_script", "queue_render", "build_version"],
            "license_ok": True,
            "color_config": "aces_2.0_studio",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["plan"]["dcc"] == "nuke"
    assert data["plan"]["engine_file"].endswith(".nk")
    assert "publish" in data["redlines"]


def test_pipeline_job_redline_blocked(client):
    resp = client.post(
        "/api/pro/pipeline/job",
        json={
            "pipeline": "ae",
            "shot_id": "sh011",
            "actions": ["publish"],
            "license_ok": True,
            "color_config": "aces",
        },
    )
    assert resp.status_code == 403
    assert "红线" in resp.json()["detail"]


def test_pipeline_job_missing_license_blocked(client):
    resp = client.post(
        "/api/pro/pipeline/job",
        json={"pipeline": "maya", "shot_id": "sh012", "actions": ["generate_script"], "color_config": "ocio"},
    )
    assert resp.status_code == 403
    assert "授权" in resp.json()["detail"]


def test_pipeline_job_missing_color_blocked(client):
    resp = client.post(
        "/api/pro/pipeline/job",
        json={"pipeline": "maya", "shot_id": "sh013", "actions": ["generate_script"], "license_ok": True},
    )
    assert resp.status_code == 403
    assert "色彩" in resp.json()["detail"]


def test_pipeline_job_unknown_action_400(client):
    resp = client.post(
        "/api/pro/pipeline/job",
        json={
            "pipeline": "nuke",
            "shot_id": "sh014",
            "actions": ["spend_money"],
            "license_ok": True,
            "color_config": "aces",
        },
    )
    assert resp.status_code in (400, 403)


def test_pipeline_job_unknown_dcc_400(client):
    resp = client.post(
        "/api/pro/pipeline/job",
        json={"pipeline": "blender", "shot_id": "sh015", "actions": [], "license_ok": True, "color_config": "x"},
    )
    assert resp.status_code == 400


def test_render_task_submit_and_status(client):
    resp = client.post(
        "/api/pro/render/task",
        json={"pipeline": "ae", "shot_id": "sh020", "version": "v001", "priority": 1},
    )
    assert resp.status_code == 200
    task_id = resp.json()["task_id"]

    status = client.get(f"/api/pro/tasks/{task_id}")
    assert status.status_code == 200
    body = status.json()
    assert body["task_id"] == task_id
    assert body["status"] in ("completed", "running", "queued", "pending", "retrying")
    assert "render_tier" in body


def test_task_status_404(client):
    resp = client.get("/api/pro/tasks/nope")
    assert resp.status_code == 404


def test_ledger_version_flow(client):
    client.post(
        "/api/pro/versions",
        json={"shot_id": "sh030", "version": "v001", "process_type": "AE", "engine_file": "a.aep", "render_path": "/r", "color_config": "aces"},
    )
    client.post(
        "/api/pro/versions",
        json={"shot_id": "sh030", "version": "v010", "process_type": "NUKE", "engine_file": "a.nk", "render_path": "/r", "color_config": "aces"},
    )
    versions = client.get("/api/pro/shots/sh030/versions").json()
    assert versions["latest"] == "v010"  # 数值排序，v010 > v001
    assert len(versions["versions"]) == 2

    check = client.post("/api/pro/version/check", json={"shot_id": "sh030", "version": "v010"})
    assert check.json()["is_latest"] is True
    check2 = client.post("/api/pro/version/check", json={"shot_id": "sh030", "version": "v001"})
    assert check2.json()["is_latest"] is False


def test_delivery_rejects_stale_version(client):
    client.post(
        "/api/pro/versions",
        json={"shot_id": "sh040", "version": "v002", "process_type": "AE", "engine_file": "x", "render_path": "/r", "color_config": "aces"},
    )
    stale = client.post(
        "/api/pro/deliveries",
        json={"shot_id": "sh040", "version": "v001", "files": ["/f"], "channel_manifest": {}},
    )
    assert stale.status_code == 409

    ok = client.post(
        "/api/pro/deliveries",
        json={"shot_id": "sh040", "version": "v002", "files": ["/f"], "channel_manifest": {"douyin": "ready"}},
    )
    assert ok.status_code == 200
    deliveries = client.get("/api/pro/deliveries", params={"shot_id": "sh040"}).json()
    assert len(deliveries["deliveries"]) == 1


def test_shots_and_assets_listing(client):
    client.post("/api/pro/shots", json={"shot_id": "sh050", "project_id": "PRJ1", "scene": "s1", "description": "d"})
    client.post("/api/pro/assets", json={"asset_id": "a1", "type": "texture", "source": "generated", "license": "ok", "path": "/p"})
    shots = client.get("/api/pro/shots", params={"project_id": "PRJ1"}).json()
    assert len(shots["shots"]) == 1
    assets = client.get("/api/pro/assets", params={"type": "texture"}).json()
    assert len(assets["assets"]) == 1
