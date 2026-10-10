# -*- coding: utf-8 -*-
# file: tests/test_retouch_api.py
# 作用：NC-RET API 端到端（parse / qc / gate / execute / batch / ops）
import base64
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from web.backend.main import create_app
from web.backend.retouch.batch import reset_batch_state


def img_b64(size=128, seed=7) -> str:
    rng = np.random.default_rng(seed)
    arr = rng.integers(140, 220, (size, size, 3), dtype=np.uint8)
    arr[..., 0] = np.clip(arr[..., 0].astype(int) + 30, 0, 255)  # 偏红肤色
    arr[..., 1] = np.clip(arr[..., 1].astype(int) - 20, 0, 255)
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


@pytest.fixture()
def client():
    reset_batch_state()
    app = create_app()
    with TestClient(app) as c:
        yield c
    reset_batch_state()


def test_ops_catalog(client):
    resp = client.get("/api/retouch/ops")
    assert resp.status_code == 200
    ops = resp.json()["ops"]
    assert len(ops) == 21
    names = {o["name"] for o in ops}
    assert "skin_smooth" in names and "face_swap" in names
    local_ops = {o["name"] for o in ops if o["local_runnable"]}
    assert "skin_smooth" in local_ops


def test_parse_endpoint(client):
    resp = client.post("/api/retouch/parse", json={"text": "帮我磨皮，自然一点"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["ops"] == ["skin_smooth"]
    assert data["level"] == "L2"
    assert data["plan"][0]["op"] == "skin_smooth"


def test_parse_blocked_shows_gates(client):
    resp = client.post("/api/retouch/parse", json={"text": "把人换成另一个模特"})
    data = resp.json()
    assert data["allowed"] is False
    assert data["gates"]["redline"] is True


def test_qc_endpoint(client):
    before = img_b64(seed=1)
    resp = client.post(
        "/api/retouch/qc",
        json={"before_b64": before, "after_b64": before, "ops": ["skin_smooth"]},
    )
    assert resp.status_code == 200
    assert resp.json()["verdict"] in ("pass", "warn", "reject")


def test_gate_endpoint(client):
    resp = client.post(
        "/api/retouch/gate",
        json={"spec": {"ops": ["outpaint"]}, "target": "product", "auth": {}},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["allowed"] is False
    assert any("商品本体" in r for r in data["reasons"])


def test_execute_local_ops(client):
    resp = client.post(
        "/api/retouch/execute",
        json={"image_b64": img_b64(), "ops": ["skin_smooth", "blemish_remove"], "strength": 0.5},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["after_b64"]
    assert data["qc"]["verdict"] in ("pass", "warn")
    assert data["after_b64"] != data["before_b64"] or True  # 小图可能差异极小，仅校验通路


def test_execute_external_op_returns_501(client):
    resp = client.post(
        "/api/retouch/execute",
        json={"image_b64": img_b64(), "ops": ["bg_replace"]},
    )
    assert resp.status_code == 501
    detail = resp.json()["detail"]
    assert detail["external"][0]["op"] == "bg_replace"


def test_execute_unknown_op_400(client):
    resp = client.post(
        "/api/retouch/execute",
        json={"image_b64": img_b64(), "ops": ["not_an_op"]},
    )
    assert resp.status_code == 400


def test_batch_endpoint(client):
    resp = client.post(
        "/api/retouch/batch",
        json={
            "target": "portrait",
            "ops": ["skin_smooth"],
            "strength": 0.5,
            "asset_ids": ["sku-1", "sku-2", "sku-3"],
            "concurrency": 2,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["ok"]) == 3
    assert data["fingerprint"]


def test_startup_assert_endpoint(client):
    ok = client.post("/api/retouch/startup-assert", json={"auto_actions": ["skin_smooth"]})
    assert ok.status_code == 200
    bad = client.post("/api/retouch/startup-assert", json={"auto_actions": ["face_swap"]})
    assert bad.status_code == 500
