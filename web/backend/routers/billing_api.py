# -*- coding: utf-8 -*-
# file: backend/routers/billing_api.py
# 作用：会员/计费接口 —— 套餐目录 / 订阅状态 / 下单 / 订单列表 / 支付回调
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from web.backend.billing import get_billing_store, get_plan, list_plans

router = APIRouter(prefix="/api/billing", tags=["billing"])


def _require_user(authorization: Optional[str]) -> str:
    """从 Authorization: Bearer <token> 解出演示 user_id（自编码 tok_<user_id>）。"""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if token.startswith("tok_") and len(token) > 4:
            return token[4:]
        raise HTTPException(status_code=401, detail="无效 token")
    raise HTTPException(status_code=401, detail="缺少 Authorization")


class SubscribeIn(BaseModel):
    plan_id: str
    period: str = "monthly"  # monthly | yearly


class WebhookIn(BaseModel):
    order_id: str
    status: str  # paid | failed | refunded
    gateway_ref: str = ""


@router.get("/plans", summary="套餐目录")
def get_plans() -> Dict[str, Any]:
    return {
        "plans": [
            {
                "id": p.id,
                "name_cn": p.name_cn,
                "name_en": p.name_en,
                "price_cny_month": p.price_cny_month,
                "price_cny_year": p.price_cny_year,
                "features_cn": p.features_cn,
                "features_en": p.features_en,
                "quota_images_month": p.quota_images_month,
                "quota_videos_month": p.quota_videos_month,
                "quota_projects": p.quota_projects,
                "quota_seats": p.quota_seats,
                "highlight": p.highlight,
            }
            for p in list_plans()
        ]
    }


@router.get("/status", summary="当前用户订阅状态")
def get_status(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    user_id = _require_user(authorization)
    store = get_billing_store()
    sub = store.get_subscription(user_id)
    try:
        plan = get_plan(sub.plan_id)
    except KeyError:
        plan = get_plan("free")
    return {
        "user_id": user_id,
        "plan_id": sub.plan_id,
        "plan_name_cn": plan.name_cn,
        "status": sub.status,
        "period": sub.period,
        "started_at": sub.started_at,
        "expires_at": sub.expires_at,
        "quota": {
            "images_month": plan.quota_images_month,
            "videos_month": plan.quota_videos_month,
            "projects": plan.quota_projects,
            "seats": plan.quota_seats,
        },
        "used_this_month": store.used_images(user_id),
    }


@router.post("/subscribe", summary="创建订阅订单（返回订单 + 支付跳转信息）")
def subscribe(req: SubscribeIn, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    user_id = _require_user(authorization)
    try:
        plan = get_plan(req.plan_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"未知套餐: {req.plan_id}")
    if req.period not in ("monthly", "yearly"):
        raise HTTPException(status_code=400, detail="period 必须是 monthly 或 yearly")

    amount = plan.price_cny_month if req.period == "monthly" else plan.price_cny_year
    store = get_billing_store()
    order = store.create_order(user_id=user_id, plan_id=req.plan_id, period=req.period, amount_cny=amount)

    # 免费套餐直接开通，无需支付
    if amount == 0:
        store.mark_order_paid(order.order_id, gateway_ref="free_plan")
        order = store.get_order(order.order_id)

    return {
        "order": {
            "order_id": order.order_id,
            "user_id": order.user_id,
            "plan_id": order.plan_id,
            "period": order.period,
            "amount_cny": order.amount_cny,
            "status": order.status,
            "created_at": order.created_at,
            "paid_at": order.paid_at,
        },
        # 演示：无真实网关，前端可直接调 /webhook 或轮询 /orders
        "pay_url": f"/api/billing/webhook/{order.order_id}" if amount > 0 else None,
    }


@router.get("/orders", summary="订单列表")
def get_orders(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    user_id = _require_user(authorization)
    orders = get_billing_store().list_orders(user_id)
    return {
        "orders": [
            {
                "order_id": o.order_id,
                "plan_id": o.plan_id,
                "period": o.period,
                "amount_cny": o.amount_cny,
                "status": o.status,
                "created_at": o.created_at,
                "paid_at": o.paid_at,
                "gateway_ref": o.gateway_ref,
            }
            for o in sorted(orders, key=lambda x: x.created_at, reverse=True)
        ]
    }


@router.post("/webhook/{order_id}", summary="支付网关回调（演示：标记已支付并开通）")
def payment_webhook(order_id: str, req: WebhookIn) -> Dict[str, Any]:
    store = get_billing_store()
    order = store.get_order(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail=f"订单不存在: {order_id}")
    if req.status == "paid":
        order = store.mark_order_paid(order_id, gateway_ref=req.gateway_ref or "mock_gateway")
    elif req.status == "failed":
        order.status = "failed"
    elif req.status == "refunded":
        order.status = "refunded"
        store.cancel_subscription(order.user_id)
    else:
        raise HTTPException(status_code=400, detail=f"不支持的状态: {req.status}")
    return {"order_id": order.order_id, "status": order.status, "paid_at": order.paid_at}
