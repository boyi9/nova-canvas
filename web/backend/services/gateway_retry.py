# -*- coding: utf-8 -*-
# file: backend/services/gateway_retry.py
# 作用：NC-CAP-07 网关唯一重试所有权与时间预算
# SDK 层重试设为 0，重试统一由网关持有；deadline 超预算即放弃
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional


class DeadlineExceededError(RuntimeError):
    """超出 deadline，放弃重试"""
    pass


class RetryBudgetExhaustedError(RuntimeError):
    """重试预算耗尽"""
    pass


@dataclass
class RetryPolicy:
    """重试策略（显式声明）"""
    max_retries: int = 2
    base_delay_s: float = 0.5
    backoff_factor: float = 2.0
    deadline_ms: int = 8000  # 默认 8 秒
    # 单次最小尝试成本（毫秒），剩余预算不足则放弃
    min_attempt_ms: int = 500

    def delay_for_attempt(self, attempt: int) -> float:
        """第 attempt 次重试前的等待秒数"""
        return self.base_delay_s * (self.backoff_factor ** attempt)


@dataclass
class CallStats:
    """单次用户请求的调用统计"""
    total_calls: int = 0       # 实际模型调用次数（含重试）
    retries: int = 0
    billed_calls: int = 0      # 计费次数（应与 total_calls 一致，重复计费 = 0）
    started_at: float = field(default_factory=time.time)
    finished_at: Optional[float] = None

    @property
    def elapsed_ms(self) -> float:
        end = self.finished_at or time.time()
        return (end - self.started_at) * 1000


class GatewayRetryOwner:
    """
    网关唯一重试所有者。
    - SDK 层重试设为 0（由调用方保证）
    - 重试统一在此处持有
    - 每次请求设 deadline_ms，剩余预算不足单次最小尝试成本即放弃
    """

    def __init__(self, policy: Optional[RetryPolicy] = None):
        self.policy = policy or RetryPolicy()

    def execute(
        self,
        fn: Callable[[], Any],
        on_retry: Optional[Callable[[int, Exception], None]] = None,
    ) -> Any:
        """
        执行模型调用，统一持有重试。
        fn: 实际调用模型的函数（SDK 层重试应为 0）
        """
        stats = CallStats()
        deadline_s = self.policy.deadline_ms / 1000.0
        start = time.time()
        last_exc: Optional[Exception] = None

        for attempt in range(self.policy.max_retries + 1):
            # 检查 deadline
            elapsed = time.time() - start
            remaining_ms = (deadline_s - elapsed) * 1000
            if remaining_ms < self.policy.min_attempt_ms:
                stats.finished_at = time.time()
                raise DeadlineExceededError(
                    f"剩余预算 {remaining_ms:.0f}ms < 最小尝试 {self.policy.min_attempt_ms}ms，放弃"
                )

            try:
                stats.total_calls += 1
                result = fn()
                stats.billed_calls = stats.total_calls  # 每次调用只计费一次
                stats.finished_at = time.time()
                return result
            except Exception as e:
                last_exc = e
                if attempt < self.policy.max_retries:
                    stats.retries += 1
                    if on_retry:
                        on_retry(attempt, e)
                    delay = self.policy.delay_for_attempt(attempt)
                    # 确保等待后仍有足够预算
                    if elapsed + delay >= deadline_s:
                        stats.finished_at = time.time()
                        raise DeadlineExceededError(
                            f"重试等待 {delay:.1f}s 将超出 deadline，放弃"
                        ) from e
                    time.sleep(delay)
                else:
                    stats.finished_at = time.time()
                    raise RetryBudgetExhaustedError(
                        f"重试 {self.policy.max_retries} 次后仍失败: {e}"
                    ) from e

        stats.finished_at = time.time()
        raise RetryBudgetExhaustedError(f"意外退出重试循环: {last_exc}")


def make_sdk_retry_zero(sdk_client: Any) -> None:
    """
    将 SDK 客户端的自动重试设为 0。
    兼容常见 SDK 配置字段。
    """
    for attr in ("max_retries", "max_attempts", "retry"):
        if hasattr(sdk_client, attr):
            try:
                setattr(sdk_client, attr, 0)
            except (AttributeError, TypeError):
                pass
    # boto3 风格
    if hasattr(sdk_client, "config"):
        try:
            sdk_client.config.retries = {"max_attempts": 0, "mode": "standard"}
        except (AttributeError, TypeError):
            pass
