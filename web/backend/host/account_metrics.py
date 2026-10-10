# -*- coding: utf-8 -*-
# file: backend/host/account_metrics.py
# 作用：账号级运营指标采集与聚合 —— 为 fuse 熔断提供真实数据源
# 设计：事件追加写入（SQLite event_log），按 account_id 分 namespace；
#       熔断监控读取聚合结果，无数据时如实返回 0/None（不伪造）。
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from web.backend.services.db import Database

NS_PREFIX = "host.account_event"

# 事件类型
KIND_TASK = "task"        # 任务结果：value=1 成功 / 0 失败
KIND_PUBLISH = "publish"  # 发布结果：value=播放量
KIND_COST = "cost"        # 花费：value=金额（元）
KIND_P0_ALERT = "p0_alert"  # P0 级违规：value=1


def _ns(account_id: str) -> str:
    return f"{NS_PREFIX}.{account_id}"


@dataclass
class AccountMetricsStore:
    """账号指标存储：写入即落盘，重启不丢。"""

    def __init__(self, db: Optional[Database] = None) -> None:
        self._lock = threading.RLock()
        self._db = db

    def _database(self) -> Database:
        if self._db is None:
            self._db = Database.instance()
        return self._db

    # ── 写入 ──────────────────────────────────────────────────────────────
    def record(
        self,
        account_id: str,
        kind: str,
        value: float = 1.0,
        meta: Optional[Dict[str, Any]] = None,
    ) -> None:
        """记录一条账号事件。"""
        payload = {
            "account_id": account_id,
            "kind": kind,
            "value": float(value),
            "ts": time.time(),
            "meta": meta or {},
        }
        with self._lock:
            try:
                self._database().append_event(_ns(account_id), payload)
            except Exception:
                pass  # 指标写入失败不阻断主流程

    def record_task_result(self, account_id: str, ok: bool, meta: Optional[Dict[str, Any]] = None) -> None:
        self.record(account_id, KIND_TASK, 1.0 if ok else 0.0, meta)

    def record_publish_views(self, account_id: str, views: int) -> None:
        self.record(account_id, KIND_PUBLISH, float(views))

    def record_cost(self, account_id: str, amount_cny: float) -> None:
        self.record(account_id, KIND_COST, float(amount_cny))

    def record_p0_alert(self, account_id: str, detail: Optional[Dict[str, Any]] = None) -> None:
        self.record(account_id, KIND_P0_ALERT, 1.0, detail)

    # ── 读取 ──────────────────────────────────────────────────────────────
    def events(self, account_id: str, kind: Optional[str] = None, limit: int = 5000) -> List[Dict[str, Any]]:
        try:
            rows = self._database().read_events(_ns(account_id), limit=limit)
        except Exception:
            return []
        out: List[Dict[str, Any]] = []
        for item in rows:
            item.pop("_id", None)
            created = item.pop("_created_at", None)
            if created is not None:
                item.setdefault("ts", created)
            if kind is None or item.get("kind") == kind:
                out.append(item)
        return out

    # ── 聚合 ──────────────────────────────────────────────────────────────
    def consecutive_failures(self, account_id: str) -> int:
        """从最近一次成功开始，向后连续失败的数量。"""
        tasks = self.events(account_id, KIND_TASK)
        count = 0
        for item in reversed(tasks):
            if float(item.get("value", 0)) >= 1.0:
                break  # 遇到成功即停止
            count += 1
        return count

    def p0_alerts(self, account_id: str) -> int:
        """未处理前的 P0 告警总数（保守：任何 P0 都触发熔断）。"""
        return len(self.events(account_id, KIND_P0_ALERT))

    def views_baseline(self, account_id: str, days: int = 30) -> Optional[float]:
        """近 N 天发布内容的平均播放量；无数据返回 None。"""
        cutoff = time.time() - days * 86400
        vals = [
            float(e.get("value", 0))
            for e in self.events(account_id, KIND_PUBLISH)
            if float(e.get("ts", 0)) >= cutoff
        ]
        vals = [v for v in vals if v > 0]
        if not vals:
            return None
        return sum(vals) / len(vals)

    def views_recent(self, account_id: str, n: int = 5) -> Optional[float]:
        """最近 N 条内容的平均播放量；无数据返回 None。"""
        vals = [
            float(e.get("value", 0))
            for e in self.events(account_id, KIND_PUBLISH)
        ]
        vals = [v for v in vals if v > 0][-n:]
        if not vals:
            return None
        return sum(vals) / len(vals)

    def drop_pct(self, account_id: str, baseline_days: int = 30, recent_n: int = 5) -> float:
        """掉量百分比：(基线 - 近期) / 基线 * 100。数据不足返回 0。"""
        baseline = self.views_baseline(account_id, baseline_days)
        recent = self.views_recent(account_id, recent_n)
        if not baseline or not recent:
            return 0.0
        drop = (baseline - recent) / baseline * 100.0
        return max(0.0, round(drop, 2))

    def cost_today(self, account_id: str) -> float:
        """当日累计花费（元）。"""
        start = time.time() - 86400
        return round(
            sum(
                float(e.get("value", 0))
                for e in self.events(account_id, KIND_COST)
                if float(e.get("ts", 0)) >= start
            ),
            4,
        )

    def budget_overflow_pct(self, account_id: str, daily_budget: Optional[float] = None) -> float:
        """预算超限百分比。无预算配置或无花费返回 0。"""
        budget = daily_budget if daily_budget is not None else self.daily_budget(account_id)
        if not budget or budget <= 0:
            return 0.0
        spent = self.cost_today(account_id)
        return max(0.0, round(spent / budget * 100.0, 2))

    # ── 日预算配置 ────────────────────────────────────────────────────────
    def set_daily_budget(self, account_id: str, amount_cny: float) -> None:
        with self._lock:
            try:
                self._database().put(f"{NS_PREFIX}.budget", account_id, {"daily_budget": amount_cny})
            except Exception:
                pass

    def daily_budget(self, account_id: str) -> Optional[float]:
        try:
            item = self._database().get(f"{NS_PREFIX}.budget", account_id)
        except Exception:
            return None
        if not item:
            return None
        value = item.get("daily_budget")
        return float(value) if value else None

    def reset(self, account_id: Optional[str] = None) -> None:
        """测试用：清空指标。"""
        with self._lock:
            db = self._database()
            if account_id:
                db.clear(_ns(account_id))
                db.delete(f"{NS_PREFIX}.budget", account_id)
            else:
                db.clear(f"{NS_PREFIX}.budget")


_store: Optional[AccountMetricsStore] = None


def get_metrics_store() -> AccountMetricsStore:
    global _store
    if _store is None:
        _store = AccountMetricsStore()
    return _store


def reset_metrics_store() -> None:
    """测试用：重置单例。"""
    global _store
    _store = None