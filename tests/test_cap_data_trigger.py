# -*- coding: utf-8 -*-
# file: tests/test_cap_data_trigger.py
# 作用：NC-CAP-06 数据驱动 5 条通道测试
import pytest
from web.backend.models.data_trigger import (
    DataChannel,
    DataTriggerEngine,
    TriggerCondition,
    TriggerResult,
    DEFAULT_THRESHOLDS,
    CHANNEL_OPERATION,
    DAILY_QUOTA,
    get_engine,
    reset_engine,
)


class TestFiveChannels:
    """5 条通道定义"""

    def test_five_channels_exist(self):
        assert len(DataChannel) == 5
        values = {c.value for c in DataChannel}
        assert values == {"D1", "D2", "D3", "D4", "D5"}

    def test_channel_operation_mapping(self):
        """每条通道有目标操作映射"""
        for ch in DataChannel:
            assert ch in CHANNEL_OPERATION
            assert CHANNEL_OPERATION[ch]


class TestMetricTrigger:
    """D1/D2 指标触发"""

    def test_completion_rate_drop_triggers(self):
        """完播 32% vs 基线 45% → 触发 optimize"""
        engine = DataTriggerEngine()
        cond = TriggerCondition(
            channel=DataChannel.D1_METRIC,
            metric_name="completion_rate",
            current_value=0.32,
            baseline_value=0.45,
        )
        result = engine.evaluate(cond)
        assert result.triggered
        assert result.operation == "optimize"
        assert result.channel == "D1"

    def test_completion_rate_normal_no_trigger(self):
        """完播正常 → 不触发"""
        engine = DataTriggerEngine()
        cond = TriggerCondition(
            channel=DataChannel.D1_METRIC,
            metric_name="completion_rate",
            current_value=0.44,
            baseline_value=0.45,
        )
        result = engine.evaluate(cond)
        assert not result.triggered

    def test_ctr_drop_triggers(self):
        """CTR 显著下降 → 触发"""
        engine = DataTriggerEngine()
        cond = TriggerCondition(
            channel=DataChannel.D2_ADS_FEEDBACK,
            metric_name="ctr",
            current_value=0.015,
            baseline_value=0.030,  # 下降 50%
        )
        result = engine.evaluate(cond)
        assert result.triggered

    def test_roi_below_triggers(self):
        """ROI 低于 1.0 → 触发"""
        engine = DataTriggerEngine()
        cond = TriggerCondition(
            channel=DataChannel.D2_ADS_FEEDBACK,
            metric_name="roi",
            current_value=0.6,
            baseline_value=1.0,
        )
        result = engine.evaluate(cond)
        assert result.triggered


class TestMissingBaseline:
    """缺基线 → 不触发"""

    def test_no_baseline_no_trigger(self):
        """CTR 无基线 → 不触发，返回'缺少基线'"""
        engine = DataTriggerEngine()
        cond = TriggerCondition(
            channel=DataChannel.D1_METRIC,
            metric_name="ctr",
            current_value=0.01,
            baseline_value=None,
        )
        result = engine.evaluate(cond)
        assert not result.triggered
        assert result.blocked_reason == "缺少基线"


class TestDailyQuota:
    """单日配额 ≤5 次"""

    def test_quota_limit(self):
        """单日已触发 5 次 → 不触发"""
        engine = DataTriggerEngine(daily_quota=3)  # 用 3 方便测试
        cond = TriggerCondition(
            channel=DataChannel.D1_METRIC,
            metric_name="completion_rate",
            current_value=0.30,
            baseline_value=0.50,  # 下降 40%，必触发
        )
        # 触发 3 次
        for i in range(3):
            result = engine.evaluate(cond)
            assert result.triggered

        # 第 4 次 → 配额满
        result = engine.evaluate(cond)
        assert not result.triggered
        assert "配额" in result.blocked_reason

    def test_quota_counted(self):
        engine = DataTriggerEngine()
        cond = TriggerCondition(
            channel=DataChannel.D1_METRIC,
            metric_name="completion_rate",
            current_value=0.30,
            baseline_value=0.50,
        )
        engine.evaluate(cond)
        engine.evaluate(cond)
        assert engine.quota_used_today() == 2


class TestSnapshotAttribution:
    """可归因：每次触发落库含 snapshot"""

    def test_snapshot_recorded(self):
        """每次触发落库含 snapshot"""
        engine = DataTriggerEngine()
        cond = TriggerCondition(
            channel=DataChannel.D1_METRIC,
            metric_name="completion_rate",
            current_value=0.32,
            baseline_value=0.45,
        )
        result = engine.evaluate(cond)
        assert result.triggered
        assert "current_value" in result.snapshot
        assert "baseline_value" in result.snapshot
        assert "evaluated_at" in result.snapshot

        records = engine.get_records()
        assert len(records) == 1
        assert records[0].snapshot == result.snapshot


class TestChannelThresholds:
    """各通道阈值配置"""

    def test_default_thresholds(self):
        assert DataChannel.D1_METRIC in DEFAULT_THRESHOLDS
        assert DEFAULT_THRESHOLDS[DataChannel.D1_METRIC]["completion_rate_drop_pct"] == 20.0

    def test_custom_thresholds(self):
        """自定义阈值生效"""
        engine = DataTriggerEngine(
            thresholds={
                DataChannel.D1_METRIC: {"completion_rate_drop_pct": 50.0},
            }
        )
        cond = TriggerCondition(
            channel=DataChannel.D1_METRIC,
            metric_name="completion_rate",
            current_value=0.35,
            baseline_value=0.50,  # 下降 30% < 50% 阈值
        )
        result = engine.evaluate(cond)
        assert not result.triggered


class TestGlobalEngine:
    """全局单例"""

    def test_get_engine(self):
        reset_engine()
        e1 = get_engine()
        e2 = get_engine()
        assert e1 is e2
