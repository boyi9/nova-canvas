"""
cost_metrics.py — AI-001 成本可观测（纯标准库，零第三方依赖）

与 circuit_breaker 分工：breaker 负责「熔断」，本模块负责「观测」。
记录每次高成本调用花费，提供文本 / Prometheus 指标导出，并支持 CLI 查询。
"""

from __future__ import annotations

import argparse
import json
import os
import threading
import time
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

REPO_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..")
)
DEFAULT_METRICS_FILE = os.path.join(REPO_ROOT, ".cost_metrics.json")


def _now_month() -> str:
    return datetime.utcnow().strftime("%Y-%m")


class CostMetrics:
    def __init__(self, metrics_file: str = "", budget_usd: float = 500.0) -> None:
        self.metrics_file = metrics_file or DEFAULT_METRICS_FILE
        self.budget_usd = budget_usd
        self._lock = threading.Lock()
        self._events: List[Dict[str, Any]] = []
        self._load()

    def record(self, tool: str, cost_usd: float, provider: str = "") -> None:
        if cost_usd <= 0:
            return
        with self._lock:
            self._events.append({
                "ts": time.time(),
                "month": _now_month(),
                "tool": tool,
                "provider": provider,
                "cost_usd": cost_usd,
            })
            self._save()

    def monthly_total(self, month: Optional[str] = None) -> float:
        month = month or _now_month()
        with self._lock:
            return round(sum(e["cost_usd"] for e in self._events if e["month"] == month), 6)

    def per_tool(self, month: Optional[str] = None) -> Dict[str, float]:
        month = month or _now_month()
        out: Dict[str, float] = defaultdict(float)
        with self._lock:
            for e in self._events:
                if e["month"] == month:
                    out[e["tool"]] += e["cost_usd"]
        return {k: round(v, 6) for k, v in out.items()}

    def snapshot(self) -> Dict[str, Any]:
        total = self.monthly_total()
        return {
            "month": _now_month(),
            "budget_usd": self.budget_usd,
            "spent_usd": total,
            "remaining_usd": round(self.budget_usd - total, 6),
            "per_tool_usd": self.per_tool(),
        }

    def render_prometheus(self) -> str:
        s = self.snapshot()
        lines = [
            f'ai_cost_budget_usd{{month="{s["month"]}"}} {s["budget_usd"]}',
            f'ai_cost_spent_usd{{month="{s["month"]}"}} {s["spent_usd"]}',
            f'ai_cost_remaining_usd{{month="{s["month"]}"}} {s["remaining_usd"]}',
        ]
        for tool, cost in s["per_tool_usd"].items():
            lines.append(f'ai_cost_per_tool_usd{{tool="{tool}"}} {cost}')
        return "\n".join(lines) + "\n"

    def render_text(self) -> str:
        s = self.snapshot()
        lines = [
            f"月份: {s['month']}",
            f"预算: {s['budget_usd']} USD",
            f"已用: {s['spent_usd']} USD",
            f"剩余: {s['remaining_usd']} USD",
            "按工具:",
        ]
        for tool, cost in s["per_tool_usd"].items():
            lines.append(f"  - {tool}: {cost} USD")
        return "\n".join(lines)

    def _load(self) -> None:
        try:
            with open(self.metrics_file, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            self._events = data.get("events", [])
        except (FileNotFoundError, ValueError):
            self._events = []

    def _save(self) -> None:
        try:
            os.makedirs(os.path.dirname(os.path.abspath(self.metrics_file)), exist_ok=True)
            with open(self.metrics_file, "w", encoding="utf-8") as fh:
                json.dump({"events": self._events}, fh, ensure_ascii=False, indent=2)
        except OSError:
            pass


_default: Optional[CostMetrics] = None


def default() -> CostMetrics:
    global _default
    if _default is None:
        _default = CostMetrics()
    return _default


def record(tool: str, cost_usd: float, provider: str = "") -> None:
    default().record(tool, cost_usd, provider)


def cli() -> None:
    p = argparse.ArgumentParser(description="AI-001 成本可观测查询")
    p.add_argument("--metrics-file", default="")
    p.add_argument("--budget", type=float, default=500.0)
    p.add_argument("--format", choices=["text", "prometheus"], default="text")
    args = p.parse_args()
    m = CostMetrics(args.metrics_file, args.budget) if args.metrics_file else CostMetrics(budget_usd=args.budget)
    print(m.render_prometheus() if args.format == "prometheus" else m.render_text())


if __name__ == "__main__":
    cli()
