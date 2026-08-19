"""circuit_breaker_test.py — 熔断器与预算守卫单测（纯标准库）。"""

import os
import tempfile
import time
import unittest
from unittest import mock

from backend.service.circuit_breaker import (
    BreakerConfig,
    BudgetExceededError,
    CircuitBreaker,
    CircuitOpenError,
    RequestTimeoutError,
)


class TestTimeoutTrip(unittest.TestCase):
    def test_slow_call_raises_and_trips_after_threshold(self):
        cfg = BreakerConfig(failure_threshold=2, request_timeout_sec=0.1, recovery_timeout_sec=999)
        b = CircuitBreaker("t", cfg)

        def slow():
            time.sleep(0.4)
            return "done"

        # 第一次超时
        with self.assertRaises(RequestTimeoutError):
            b.call(slow)
        self.assertEqual(b.state, "CLOSED")  # 未达阈值
        # 第二次超时 -> 触发 OPEN
        with self.assertRaises(RequestTimeoutError):
            b.call(slow)
        self.assertEqual(b.state, "OPEN")
        self.assertFalse(b.allow())


class TestConsecutiveFailure(unittest.TestCase):
    def test_failures_trip_open(self):
        cfg = BreakerConfig(failure_threshold=3, request_timeout_sec=5, recovery_timeout_sec=999)
        b = CircuitBreaker("f", cfg)

        def boom():
            raise ValueError("x")

        for _ in range(3):
            with self.assertRaises(ValueError):
                b.call(boom)
        self.assertEqual(b.state, "OPEN")
        with self.assertRaises(CircuitOpenError):
            b.call(boom)


class TestBudget(unittest.TestCase):
    def test_budget_exceeded_blocks(self):
        cfg = BreakerConfig(monthly_budget_usd=1.0, request_timeout_sec=5)
        b = CircuitBreaker("b", cfg)

        def ok():
            return "ok"

        # 第一次 0.6 通过
        self.assertEqual(b.call(ok, cost_usd=0.6), "ok")
        # 累计 0.6+0.6=1.2 > 1.0 -> 拒绝
        with self.assertRaises(BudgetExceededError):
            b.call(ok, cost_usd=0.6)

    def test_budget_within_limit_accumulates(self):
        cfg = BreakerConfig(monthly_budget_usd=10.0, request_timeout_sec=5)
        b = CircuitBreaker("b2", cfg)

        def ok():
            return "ok"

        b.call(ok, cost_usd=2.0)
        b.call(ok, cost_usd=3.0)
        self.assertAlmostEqual(b.snapshot()["spent_usd"], 5.0, places=4)


class TestHalfOpenRecovery(unittest.TestCase):
    def test_recovers_to_half_open_then_closed(self):
        clock = {"t": 0.0}

        def now():
            return clock["t"]

        cfg = BreakerConfig(failure_threshold=1, request_timeout_sec=5, recovery_timeout_sec=10)
        b = CircuitBreaker("h", cfg, now=now)

        def boom():
            raise RuntimeError

        with self.assertRaises(RuntimeError):
            b.call(boom)
        self.assertEqual(b.state, "OPEN")
        self.assertFalse(b.allow())

        clock["t"] = 11  # 超过恢复窗口
        self.assertTrue(b.allow())
        self.assertEqual(b.state, "HALF_OPEN")

        def ok():
            return "fine"

        self.assertEqual(b.call(ok), "fine")
        self.assertEqual(b.state, "CLOSED")


class TestDisabledPassthrough(unittest.TestCase):
    def test_disabled_ignores_breaker(self):
        cfg = BreakerConfig(enabled=False, request_timeout_sec=0.1)
        b = CircuitBreaker("d", cfg)

        def slow():
            time.sleep(0.3)
            return "done"

        self.assertEqual(b.call(slow), "done")  # 不过滤超时


class TestBudgetPersistence(unittest.TestCase):
    def test_budget_saved_and_reloaded(self):
        fd, path = tempfile.mkstemp(suffix=".json")
        os.close(fd)
        try:
            cfg = BreakerConfig(monthly_budget_usd=100.0, budget_file=path, request_timeout_sec=5)
            b1 = CircuitBreaker("p", cfg)

            def ok():
                return "ok"

            b1.call(ok, cost_usd=7.5)
            self.assertTrue(os.path.exists(path))

            # 新实例从文件恢复
            b2 = CircuitBreaker("p", cfg)
            self.assertAlmostEqual(b2.snapshot()["spent_usd"], 7.5, places=4)
        finally:
            if os.path.exists(path):
                os.remove(path)


if __name__ == "__main__":
    unittest.main()
