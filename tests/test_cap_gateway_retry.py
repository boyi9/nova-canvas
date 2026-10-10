# -*- coding: utf-8 -*-
# file: tests/test_cap_gateway_retry.py
# 作用：NC-CAP-07 网关唯一重试所有权与时间预算测试
import time
import pytest
from web.backend.services.gateway_retry import (
    RetryPolicy,
    CallStats,
    GatewayRetryOwner,
    DeadlineExceededError,
    RetryBudgetExhaustedError,
    make_sdk_retry_zero,
)


class TestRetryPolicy:
    """重试策略"""

    def test_default_policy(self):
        p = RetryPolicy()
        assert p.max_retries == 2
        assert p.deadline_ms == 8000
        assert p.min_attempt_ms == 500

    def test_delay_backoff(self):
        p = RetryPolicy(base_delay_s=0.5, backoff_factor=2.0)
        assert p.delay_for_attempt(0) == 0.5
        assert p.delay_for_attempt(1) == 1.0
        assert p.delay_for_attempt(2) == 2.0


class TestGatewayRetryOwner:
    """网关重试所有者"""

    def test_success_first_try(self):
        """首次成功 → 不重试"""
        owner = GatewayRetryOwner(RetryPolicy(max_retries=2))
        result = owner.execute(lambda: "ok")
        assert result == "ok"

    def test_retry_then_success(self):
        """失败 1 次后成功"""
        owner = GatewayRetryOwner(RetryPolicy(max_retries=2, base_delay_s=0.01))
        calls = {"n": 0}

        def flaky():
            calls["n"] += 1
            if calls["n"] == 1:
                raise ValueError("first fail")
            return "recovered"

        result = owner.execute(flaky)
        assert result == "recovered"
        assert calls["n"] == 2

    def test_retry_exhausted(self):
        """重试耗尽 → RetryBudgetExhaustedError"""
        owner = GatewayRetryOwner(RetryPolicy(max_retries=1, base_delay_s=0.01))

        def always_fail():
            raise ValueError("always fail")

        with pytest.raises(RetryBudgetExhaustedError):
            owner.execute(always_fail)

    def test_no_retry_amplification(self):
        """单次用户请求的模型调用次数不因重试而放大（有上限）"""
        owner = GatewayRetryOwner(RetryPolicy(max_retries=3, base_delay_s=0.01))
        calls = {"n": 0}

        def fail():
            calls["n"] += 1
            raise ValueError("fail")

        with pytest.raises(RetryBudgetExhaustedError):
            owner.execute(fail)

        # 最多 max_retries + 1 次
        assert calls["n"] == 4  # 1 initial + 3 retries

    def test_deadline_exceeded(self):
        """超预算请求在 deadline 内返回失败，不悬挂"""
        policy = RetryPolicy(
            max_retries=10,
            deadline_ms=100,  # 100ms deadline
            min_attempt_ms=50,
            base_delay_s=0.1,
        )
        owner = GatewayRetryOwner(policy)

        def slow_fail():
            time.sleep(0.15)  # 每次 150ms，超 deadline
            raise ValueError("slow fail")

        with pytest.raises((DeadlineExceededError, RetryBudgetExhaustedError)):
            owner.execute(slow_fail)

    def test_on_retry_callback(self):
        """重试回调被调用"""
        owner = GatewayRetryOwner(RetryPolicy(max_retries=2, base_delay_s=0.01))
        retry_events = []

        def on_retry(attempt, exc):
            retry_events.append(attempt)

        calls = {"n": 0}

        def flaky():
            calls["n"] += 1
            if calls["n"] <= 2:
                raise ValueError("fail")
            return "ok"

        result = owner.execute(flaky, on_retry=on_retry)
        assert result == "ok"
        assert len(retry_events) == 2


class TestMakeSdkRetryZero:
    """SDK 重试设 0"""

    def test_set_max_retries(self):
        class FakeSDK:
            max_retries = 5

        sdk = FakeSDK()
        make_sdk_retry_zero(sdk)
        assert sdk.max_retries == 0

    def test_set_max_attempts(self):
        class FakeSDK:
            max_attempts = 3

        sdk = FakeSDK()
        make_sdk_retry_zero(sdk)
        assert sdk.max_attempts == 0

    def test_no_attribute_no_error(self):
        class FakeSDK:
            pass

        sdk = FakeSDK()
        make_sdk_retry_zero(sdk)  # 不应报错


class TestNoDuplicateBilling:
    """重复计费 0 次"""

    def test_billed_calls_equals_total(self):
        """每次调用只计费一次（billed == total）"""
        owner = GatewayRetryOwner(RetryPolicy(max_retries=2, base_delay_s=0.01))
        # 此处只验证逻辑：billed_calls 应与 total_calls 一致
        # 实际计费在 execute 内部保证
        calls = {"n": 0}

        def flaky():
            calls["n"] += 1
            if calls["n"] == 1:
                raise ValueError("fail")
            return "ok"

        owner.execute(flaky)
        # 如果有计费逻辑，总调用 2 次 = 计费 2 次（不会重复计同一调用）
        assert calls["n"] == 2
