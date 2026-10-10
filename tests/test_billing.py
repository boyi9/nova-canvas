# -*- coding: utf-8 -*-
# tests/test_billing.py —— P2-1 会员/计费
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from web.backend.billing import get_billing_store, reset_billing_store
from web.backend.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean(tmp_path, monkeypatch):
    """每个测试用独立临时 SQLite，避免污染真实数据目录并保证隔离。"""
    db_file = tmp_path / "billing.db"
    monkeypatch.setenv("NOVA_DB_PATH", str(db_file))
    reset_billing_store(db_path=db_file)
    yield
    reset_billing_store()


AUTH = {"Authorization": "Bearer tok_user_demo"}
AUTH2 = {"Authorization": "Bearer tok_user_other"}


class TestPlans:
    def test_list_plans(self):
        r = client.get("/api/billing/plans")
        assert r.status_code == 200
        data = r.json()
        ids = {p["id"] for p in data["plans"]}
        assert ids == {"free", "pro", "team"}
        pro = next(p for p in data["plans"] if p["id"] == "pro")
        assert pro["price_cny_month"] == 9900
        assert pro["highlight"] is True

    def test_get_plan_detail(self):
        from web.backend.billing import get_plan

        p = get_plan("team")
        assert p.quota_seats == 10
        with pytest.raises(KeyError):
            get_plan("enterprise")


class TestStatus:
    def test_default_free(self):
        r = client.get("/api/billing/status", headers=AUTH)
        assert r.status_code == 200
        d = r.json()
        assert d["plan_id"] == "free"
        assert d["status"] == "active"
        assert d["quota"]["images_month"] == 100

    def test_unauthorized(self):
        r = client.get("/api/billing/status")
        assert r.status_code == 401
        r2 = client.get("/api/billing/status", headers={"Authorization": "Bearer bad"})
        assert r2.status_code == 401


class TestSubscribe:
    def test_free_plan_auto_activate(self):
        r = client.post("/api/billing/subscribe", json={"plan_id": "free"}, headers=AUTH)
        assert r.status_code == 200
        order = r.json()["order"]
        assert order["status"] == "paid"
        assert order["amount_cny"] == 0
        # 状态已变
        st = client.get("/api/billing/status", headers=AUTH).json()
        assert st["plan_id"] == "free"

    def test_pro_plan_pending_then_webhook(self):
        r = client.post(
            "/api/billing/subscribe",
            json={"plan_id": "pro", "period": "monthly"},
            headers=AUTH,
        )
        assert r.status_code == 200
        body = r.json()
        order = body["order"]
        assert order["status"] == "pending"
        assert order["amount_cny"] == 9900
        assert body["pay_url"] is not None

        # webhook 支付成功
        wr = client.post(
            f"/api/billing/webhook/{order['order_id']}",
            json={"order_id": order["order_id"], "status": "paid", "gateway_ref": "wx123"},
        )
        assert wr.status_code == 200
        assert wr.json()["status"] == "paid"

        st = client.get("/api/billing/status", headers=AUTH).json()
        assert st["plan_id"] == "pro"
        assert st["expires_at"] is not None

    def test_yearly_amount(self):
        r = client.post(
            "/api/billing/subscribe",
            json={"plan_id": "team", "period": "yearly"},
            headers=AUTH,
        )
        assert r.json()["order"]["amount_cny"] == 299000

    def test_unknown_plan(self):
        r = client.post("/api/billing/subscribe", json={"plan_id": "gold"}, headers=AUTH)
        assert r.status_code == 404

    def test_bad_period(self):
        r = client.post(
            "/api/billing/subscribe",
            json={"plan_id": "pro", "period": "weekly"},
            headers=AUTH,
        )
        assert r.status_code == 400


class TestOrders:
    def test_list_and_isolation(self):
        client.post("/api/billing/subscribe", json={"plan_id": "pro"}, headers=AUTH)
        client.post("/api/billing/subscribe", json={"plan_id": "team"}, headers=AUTH2)
        r1 = client.get("/api/billing/orders", headers=AUTH).json()
        r2 = client.get("/api/billing/orders", headers=AUTH2).json()
        assert len(r1["orders"]) == 1  # free 自动开通
        assert len(r2["orders"]) == 1
        assert r1["orders"][0]["plan_id"] == "pro"
        assert r2["orders"][0]["plan_id"] == "team"


class TestWebhook:
    def test_failed_and_refunded(self):
        r = client.post(
            "/api/billing/subscribe",
            json={"plan_id": "pro"},
            headers=AUTH,
        )
        oid = r.json()["order"]["order_id"]
        # 先支付
        client.post(f"/api/billing/webhook/{oid}", json={"order_id": oid, "status": "paid"})
        # 退款
        rr = client.post(
            f"/api/billing/webhook/{oid}", json={"order_id": oid, "status": "refunded"}
        )
        assert rr.json()["status"] == "refunded"
        st = client.get("/api/billing/status", headers=AUTH).json()
        assert st["status"] == "canceled"

    def test_order_not_found(self):
        r = client.post(
            "/api/billing/webhook/ord_none", json={"order_id": "ord_none", "status": "paid"}
        )
        assert r.status_code == 404


class TestQuota:
    def test_consume_quota(self):
        store = get_billing_store()
        assert store.consume_image_quota("u1", 1) is True
        # 超出 free 配额（100）
        assert store.consume_image_quota("u2", 101) is False
        # 消费 99 次后第 100 次仍可，101 次失败
        for _ in range(99):
            assert store.consume_image_quota("u3", 1) is True
        assert store.consume_image_quota("u3", 1) is True
        assert store.consume_image_quota("u3", 1) is False
