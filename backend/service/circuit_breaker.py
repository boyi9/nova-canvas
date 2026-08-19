"""
circuit_breaker.py — 通用熔断器 + 月度预算守卫（纯标准库，零第三方依赖）

设计目标（见 ADR 006）：
  - 单请求硬超时（默认 5s）即记为失败，用于阻断高成本/慢调用
  - 月度预算（默认 500 USD）超限即拒绝后续高成本调用
  - 标准状态机：CLOSED -> OPEN -> HALF_OPEN -> CLOSED / OPEN

用法：
    breaker = CircuitBreaker("video", BreakerConfig(request_timeout_sec=5, monthly_budget_usd=500))
    try:
        result = breaker.call(adapter.generate_video, req, cost_usd=0.05)
    except (CircuitOpenError, BudgetExceededError, RequestTimeoutError) as e:
        ...
"""

from __future__ import annotations

import json
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, Optional


CLOSED = "CLOSED"
OPEN = "OPEN"
HALF_OPEN = "HALF_OPEN"


class CircuitError(Exception):
    """熔断模块基础异常。"""


class CircuitOpenError(CircuitError):
    """熔断器处于 OPEN 状态，请求被拒绝。"""


class BudgetExceededError(CircuitError):
    """当月预算已超限，请求被拒绝。"""


class RequestTimeoutError(CircuitError):
    """单次调用超过 request_timeout_sec 被中断。"""


@dataclass
class BreakerConfig:
    failure_threshold: int = 5
    recovery_timeout_sec: float = 30.0
    request_timeout_sec: float = 5.0
    monthly_budget_usd: float = 500.0
    half_open_max_calls: int = 1
    budget_file: str = ""
    enabled: bool = True


@dataclass
class _BudgetBook:
    month: str = ""
    spent_usd: float = 0.0


class CircuitBreaker:
    def __init__(
        self,
        name: str,
        config: Optional[BreakerConfig] = None,
        now: Optional[Callable[[], float]] = None,
    ) -> None:
        self.name = name
        self.config = config or BreakerConfig()
        self._now = now or time.monotonic
        self._state = CLOSED
        self._failure_count = 0
        self._opened_at: Optional[float] = None
        self._half_open_calls = 0
        self._lock = threading.Lock()
        self._budget = _BudgetBook()
        if self.config.budget_file:
            self._load_budget()

    # ----- 状态查询 -----
    @property
    def state(self) -> str:
        with self._lock:
            self._maybe_recover()
            return self._state

    def allow(self) -> bool:
        with self._lock:
            self._maybe_recover()
            if self._state == CLOSED:
                return True
            if self._state == HALF_OPEN and self._half_open_calls < self.config.half_open_max_calls:
                return True
            return False

    # ----- 核心调用 -----
    def call(
        self,
        func: Callable[..., Any],
        *args: Any,
        cost_usd: float = 0.0,
        **kwargs: Any,
    ) -> Any:
        if not self.config.enabled:
            return func(*args, **kwargs)

        if not self.allow():
            raise CircuitOpenError(
                f"[{self.name}] 熔断器为 {self.state}，请求被拒绝（预算/故障熔断）"
            )

        if cost_usd > 0 and self._budget_exceeded(cost_usd):
            raise BudgetExceededError(
                f"[{self.name}] 月度预算 {self.config.monthly_budget_usd} USD 已超限，"
                f"本次预估 {cost_usd} USD 被拒绝"
            )

        half_open_probe = self._state == HALF_OPEN
        with self._lock:
            if half_open_probe:
                self._half_open_calls += 1

        try:
            result = self._invoke(func, args, kwargs)
        except RequestTimeoutError:
            self._record_failure()
            raise
        except Exception:
            self._record_failure()
            raise

        self._record_success()
        if cost_usd > 0:
            self._add_spend(cost_usd)
        return result

    # ----- 内部实现 -----
    def _invoke(self, func: Callable[..., Any], args: Any, kwargs: Any) -> Any:
        timeout = self.config.request_timeout_sec
        with ThreadPoolExecutor(max_workers=1, thread_name_prefix=f"cb-{self.name}") as pool:
            future = pool.submit(func, *args, **kwargs)
            try:
                return future.result(timeout=timeout)
            except TimeoutError:
                future.cancel()
                raise RequestTimeoutError(
                    f"[{self.name}] 调用超时（>{timeout}s），已触发熔断"
                )

    def _record_success(self) -> None:
        with self._lock:
            self._failure_count = 0
            self._half_open_calls = 0
            self._state = CLOSED

    def _record_failure(self) -> None:
        with self._lock:
            self._failure_count += 1
            self._half_open_calls = 0
            if self._state == HALF_OPEN:
                self._trip()
            elif self._failure_count >= self.config.failure_threshold:
                self._trip()

    def _trip(self) -> None:
        self._state = OPEN
        self._opened_at = self._now()

    def _maybe_recover(self) -> None:
        if self._state == OPEN and self._opened_at is not None:
            if (self._now() - self._opened_at) >= self.config.recovery_timeout_sec:
                self._state = HALF_OPEN
                self._half_open_calls = 0

    # ----- 预算记账 -----
    def _current_month(self) -> str:
        return datetime.utcnow().strftime("%Y-%m")

    def _budget_exceeded(self, cost_usd: float) -> bool:
        with self._lock:
            self._rollover_month()
            return (self._budget.spent_usd + cost_usd) > self.config.monthly_budget_usd

    def _add_spend(self, cost_usd: float) -> None:
        with self._lock:
            self._rollover_month()
            self._budget.spent_usd += cost_usd
        if self.config.budget_file:
            self._save_budget()

    def _rollover_month(self) -> None:
        cur = self._current_month()
        if self._budget.month != cur:
            self._budget.month = cur
            self._budget.spent_usd = 0.0

    def _load_budget(self) -> None:
        try:
            with open(self.config.budget_file, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            self._budget.month = data.get("month", "")
            self._budget.spent_usd = float(data.get("spent_usd", 0.0))
        except (FileNotFoundError, ValueError):
            self._budget = _BudgetBook()

    def _save_budget(self) -> None:
        with self._lock:
            payload = {
                "name": self.name,
                "month": self._budget.month,
                "spent_usd": self._budget.spent_usd,
            }
        try:
            os.makedirs(os.path.dirname(self.config.budget_file), exist_ok=True)
            with open(self.config.budget_file, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, ensure_ascii=False, indent=2)
        except OSError:
            pass

    # ----- 调试/运维接口 -----
    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "name": self.name,
                "state": self._state,
                "failure_count": self._failure_count,
                "month": self._budget.month,
                "spent_usd": round(self._budget.spent_usd, 4),
                "budget_usd": self.config.monthly_budget_usd,
            }

    def reset(self) -> None:
        with self._lock:
            self._state = CLOSED
            self._failure_count = 0
            self._half_open_calls = 0
            self._opened_at = None


__all__ = [
    "CLOSED",
    "OPEN",
    "HALF_OPEN",
    "CircuitError",
    "CircuitOpenError",
    "BudgetExceededError",
    "RequestTimeoutError",
    "BreakerConfig",
    "CircuitBreaker",
]
