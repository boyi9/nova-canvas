# -*- coding: utf-8 -*-
# file: backend/billing/store.py
# 作用：订阅/订单持久化台账 —— SQLite 落盘 + 内存缓存，线程安全
from __future__ import annotations

import secrets
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from web.backend.services.db import Database

NS_SUB = "billing.subscription"
NS_ORDER = "billing.order"
NS_USAGE = "billing.usage"


@dataclass
class Subscription:
    user_id: str
    plan_id: str = "free"
    status: str = "active"  # active | canceled | past_due
    period: str = "monthly"  # monthly | yearly
    started_at: float = field(default_factory=time.time)
    expires_at: Optional[float] = None  # None = 永不过期（免费/手动取消）


@dataclass
class Order:
    order_id: str
    user_id: str
    plan_id: str
    period: str  # monthly | yearly
    amount_cny: int  # 分
    status: str = "pending"  # pending | paid | failed | refunded
    created_at: float = field(default_factory=time.time)
    paid_at: Optional[float] = None
    gateway_ref: str = ""


class BillingStore:
    """订阅/订单台账：写入 SQLite（重启不丢），读取走内存缓存。"""

    def __init__(self, db: Optional[Database] = None, db_path: Optional[Path] = None) -> None:
        self._lock = threading.RLock()
        self._db = db if db is not None else Database.instance(db_path)
        self._subs: Dict[str, Subscription] = {}  # user_id → Subscription
        self._orders: Dict[str, Order] = {}  # order_id → Order
        self._used_by_user: Dict[str, int] = {}  # user_id → 本月已用生图数
        self._load()

    # ── 持久化 ────────────────────────────────────────────────────────────
    def _load(self) -> None:
        """从 SQLite 恢复内存缓存（损坏数据跳过，不阻断启动）。"""
        try:
            for item in self._db.list(NS_SUB):
                doc_id = item.pop("_id", None)
                if not doc_id:
                    continue
                self._subs[doc_id] = Subscription(**{k: v for k, v in item.items() if k in Subscription.__dataclass_fields__})
            for item in self._db.list(NS_ORDER):
                doc_id = item.pop("_id", None)
                if not doc_id:
                    continue
                self._orders[doc_id] = Order(**{k: v for k, v in item.items() if k in Order.__dataclass_fields__})
            for item in self._db.list(NS_USAGE):
                doc_id = item.pop("_id", None)
                if doc_id:
                    self._used_by_user[doc_id] = int(item.get("used", 0))
        except Exception:
            # 磁盘数据异常时以空台账继续运行
            self._subs.clear()
            self._orders.clear()
            self._used_by_user.clear()

    def _save_sub(self, sub: Subscription) -> None:
        self._db.put(NS_SUB, sub.user_id, asdict(sub))

    def _save_order(self, order: Order) -> None:
        self._db.put(NS_ORDER, order.order_id, asdict(order))

    def _save_usage(self, user_id: str) -> None:
        self._db.put(NS_USAGE, user_id, {"used": self._used_by_user.get(user_id, 0)})

    # ── 订阅 ──────────────────────────────────────────────────────────────
    def get_subscription(self, user_id: str) -> Subscription:
        with self._lock:
            sub = self._subs.get(user_id)
            if sub is None:
                sub = Subscription(user_id=user_id, plan_id="free")
                self._subs[user_id] = sub
                self._save_sub(sub)
            return sub

    def set_subscription(
        self,
        user_id: str,
        plan_id: str,
        period: str = "monthly",
        expires_at: Optional[float] = None,
    ) -> Subscription:
        with self._lock:
            sub = Subscription(
                user_id=user_id,
                plan_id=plan_id,
                status="active",
                period=period,
                expires_at=expires_at,
            )
            self._subs[user_id] = sub
            self._save_sub(sub)
            return sub

    def cancel_subscription(self, user_id: str) -> Optional[Subscription]:
        with self._lock:
            sub = self._subs.get(user_id)
            if sub is None:
                return None
            sub.status = "canceled"
            self._save_sub(sub)
            return sub

    # ── 订单 ──────────────────────────────────────────────────────────────
    def create_order(
        self,
        user_id: str,
        plan_id: str,
        period: str,
        amount_cny: int,
        gateway_ref: str = "",
    ) -> Order:
        with self._lock:
            order_id = f"ord_{secrets.token_hex(8)}"
            order = Order(
                order_id=order_id,
                user_id=user_id,
                plan_id=plan_id,
                period=period,
                amount_cny=amount_cny,
                gateway_ref=gateway_ref,
            )
            self._orders[order_id] = order
            self._save_order(order)
            return order

    def get_order(self, order_id: str) -> Optional[Order]:
        with self._lock:
            return self._orders.get(order_id)

    def mark_order_paid(self, order_id: str, gateway_ref: str = "") -> Optional[Order]:
        with self._lock:
            order = self._orders.get(order_id)
            if order is None:
                return None
            order.status = "paid"
            order.paid_at = time.time()
            if gateway_ref:
                order.gateway_ref = gateway_ref
            # 支付成功 → 自动开通订阅
            expires_at = None
            if order.period == "monthly":
                expires_at = time.time() + 30 * 86400
            elif order.period == "yearly":
                expires_at = time.time() + 365 * 86400
            self._save_order(order)
            self.set_subscription(order.user_id, order.plan_id, order.period, expires_at)
            return order

    def list_orders(self, user_id: str) -> List[Order]:
        with self._lock:
            return [o for o in self._orders.values() if o.user_id == user_id]

    # ── 配额 ──────────────────────────────────────────────────────────────
    def consume_image_quota(self, user_id: str, n: int = 1) -> bool:
        """尝试扣减生图配额；配额不足返回 False。"""
        from .plans import get_plan

        with self._lock:
            sub = self.get_subscription(user_id)
            plan = get_plan(sub.plan_id)
            used = self._used_by_user.get(user_id, 0)
            if used + n > plan.quota_images_month:
                return False
            self._used_by_user[user_id] = used + n
            self._save_usage(user_id)
            return True

    def used_images(self, user_id: str) -> int:
        with self._lock:
            return self._used_by_user.get(user_id, 0)


_store: Optional[BillingStore] = None


def get_billing_store() -> BillingStore:
    global _store
    if _store is None:
        _store = BillingStore()
    return _store


def reset_billing_store(db_path: Optional[Path] = None) -> None:
    """测试用：重置模块级存储（可指定临时 DB 路径）。"""
    global _store
    _store = None
    if db_path is not None:
        Database.reset(db_path)
