# -*- coding: utf-8 -*-
# file: backend/models/data_trigger.py
# 作用：NC-CAP-06 数据驱动 5 条通道（D1–D5）
# 三条反噪声硬规则：阈值触发 / 可归因（记录数据快照）/ 单日配额 ≤5 次
from dataclasses import dataclass, field
from datetime import datetime, date
from typing import Any, Dict, List, Optional, Callable
from enum import Enum


class DataChannel(str, Enum):
    """5 条数据通道"""
    D1_METRIC = "D1"         # 指标诊断：账号 7/30 天数据
    D2_ADS_FEEDBACK = "D2"   # 投放反馈：CTR/CVR/ROI
    D3_HANDOFF = "D3"        # 人机接缝：线下拍摄/授权/审核回传
    D4_RULE_RADAR = "D4"     # 规则雷达：平台规则变更
    D5_BENCHMARK = "D5"      # 对标池：竞品爆款变化


# 单日配额上限
DAILY_QUOTA = 5

# 各通道默认触发条件（阈值）
DEFAULT_THRESHOLDS: Dict[DataChannel, Dict[str, Any]] = {
    DataChannel.D1_METRIC: {
        # 完播率低于类目均值 20% 以上触发
        "completion_rate_drop_pct": 20.0,
        # CTR 低于基线 15% 触发
        "ctr_drop_pct": 15.0,
    },
    DataChannel.D2_ADS_FEEDBACK: {
        # CTR 显著低于同批次（Z-score）
        "ctr_zscore_threshold": -2.0,
        # ROI 低于盈亏线
        "roi_below": 1.0,
    },
    DataChannel.D3_HANDOFF: {
        # 素材回传 QC 拒绝
        "qc_reject": True,
        # 授权过期天数
        "auth_expire_days": 7,
    },
    DataChannel.D4_RULE_RADAR: {
        # P0 规则变更
        "priority_levels": ["P0", "P1"],
    },
    DataChannel.D5_BENCHMARK: {
        # 对标账号爆款数增长阈值
        "viral_growth_pct": 50.0,
    },
}

# 通道 → 目标操作映射
CHANNEL_OPERATION: Dict[DataChannel, str] = {
    DataChannel.D1_METRIC: "optimize",
    DataChannel.D2_ADS_FEEDBACK: "optimize",
    DataChannel.D3_HANDOFF: "repair",
    DataChannel.D4_RULE_RADAR: "adjust",
    DataChannel.D5_BENCHMARK: "create",
}


@dataclass
class TriggerCondition:
    """触发条件"""
    channel: DataChannel
    metric_name: str
    current_value: float
    baseline_value: Optional[float]  # 缺基线 → 不触发
    threshold_pct: Optional[float] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TriggerResult:
    """触发结果"""
    triggered: bool
    channel: str
    operation: str
    reason: str
    snapshot: Dict[str, Any] = field(default_factory=dict)
    blocked_reason: str = ""


@dataclass
class TriggerRecord:
    """触发记录（落库）"""
    id: str
    channel: str
    operation: str
    triggered_at: str
    snapshot: Dict[str, Any]
    quota_used: int = 1


class DataTriggerEngine:
    """数据触发引擎：5 通道 + 3 反噪声规则"""

    def __init__(
        self,
        thresholds: Optional[Dict[DataChannel, Dict[str, Any]]] = None,
        daily_quota: int = DAILY_QUOTA,
    ):
        self.thresholds = thresholds or DEFAULT_THRESHOLDS
        self.daily_quota = daily_quota
        self._today_triggers: Dict[str, int] = {}  # date_str -> count
        self._records: List[TriggerRecord] = []
        self._record_counter = 0

    def evaluate(
        self,
        condition: TriggerCondition,
        snapshot: Optional[Dict[str, Any]] = None,
    ) -> TriggerResult:
        """
        评估触发条件。
        三条反噪声硬规则：
          1. 阈值触发：必须超过阈值
          2. 可归因：记录数据快照
          3. 单日配额：≤5 次
        缺基线 → 不触发
        """
        channel = condition.channel
        operation = CHANNEL_OPERATION.get(channel, "optimize")
        snap = dict(snapshot or {})
        snap.update({
            "channel": channel.value,
            "metric_name": condition.metric_name,
            "current_value": condition.current_value,
            "baseline_value": condition.baseline_value,
            "evaluated_at": datetime.now().isoformat(),
        })

        # 规则 0：缺基线 → 不触发（不允许凭空启动模型）
        if condition.baseline_value is None:
            return TriggerResult(
                triggered=False,
                channel=channel.value,
                operation=operation,
                reason="评估完成",
                snapshot=snap,
                blocked_reason="缺少基线",
            )

        # 规则 1：阈值触发
        triggered, reason = self._check_threshold(condition)
        if not triggered:
            return TriggerResult(
                triggered=False,
                channel=channel.value,
                operation=operation,
                reason=reason,
                snapshot=snap,
                blocked_reason=reason,
            )

        # 规则 3：单日配额
        today = date.today().isoformat()
        used = self._today_triggers.get(today, 0)
        if used >= self.daily_quota:
            return TriggerResult(
                triggered=False,
                channel=channel.value,
                operation=operation,
                reason=reason,
                snapshot=snap,
                blocked_reason=f"单日配额已满（{used}/{self.daily_quota}）",
            )

        # 通过所有规则 → 触发
        self._today_triggers[today] = used + 1
        self._record_counter += 1
        record = TriggerRecord(
            id=f"trig-{self._record_counter:04d}",
            channel=channel.value,
            operation=operation,
            triggered_at=datetime.now().isoformat(),
            snapshot=snap,
            quota_used=self._today_triggers[today],
        )
        self._records.append(record)

        return TriggerResult(
            triggered=True,
            channel=channel.value,
            operation=operation,
            reason=reason,
            snapshot=snap,
        )

    def _check_threshold(self, cond: TriggerCondition) -> tuple:
        """检查阈值是否满足"""
        ch_thresh = self.thresholds.get(cond.channel, {})
        name = cond.metric_name

        # D1: 完播率下降
        if name == "completion_rate" and cond.baseline_value:
            drop_pct = (cond.baseline_value - cond.current_value) / cond.baseline_value * 100
            threshold = ch_thresh.get("completion_rate_drop_pct", 20.0)
            if drop_pct >= threshold:
                return True, f"完播率下降 {drop_pct:.1f}% ≥ {threshold}%"
            return False, f"完播率下降 {drop_pct:.1f}% < {threshold}%"

        # D1/D2: CTR 下降
        if name == "ctr" and cond.baseline_value:
            drop_pct = (cond.baseline_value - cond.current_value) / cond.baseline_value * 100
            threshold = ch_thresh.get("ctr_drop_pct", 15.0)
            if drop_pct >= threshold:
                return True, f"CTR 下降 {drop_pct:.1f}% ≥ {threshold}%"
            return False, f"CTR 下降 {drop_pct:.1f}% < {threshold}%"

        # D2: ROI 低于盈亏线
        if name == "roi":
            below = ch_thresh.get("roi_below", 1.0)
            if cond.current_value < below:
                return True, f"ROI {cond.current_value:.2f} < {below}"
            return False, f"ROI {cond.current_value:.2f} ≥ {below}"

        # 通用：current < baseline * (1 - threshold/100)
        if cond.threshold_pct is not None and cond.baseline_value:
            threshold_val = cond.baseline_value * (1 - cond.threshold_pct / 100)
            if cond.current_value < threshold_val:
                return True, f"{name} {cond.current_value} < 阈值 {threshold_val:.4f}"
            return False, f"{name} {cond.current_value} ≥ 阈值 {threshold_val:.4f}"

        return False, f"无匹配阈值规则: {name}"

    def get_records(self) -> List[TriggerRecord]:
        return list(self._records)

    def quota_used_today(self) -> int:
        today = date.today().isoformat()
        return self._today_triggers.get(today, 0)

    def reset_quota(self) -> None:
        self._today_triggers.clear()


# 全局单例
_engine: Optional[DataTriggerEngine] = None


def get_engine() -> DataTriggerEngine:
    global _engine
    if _engine is None:
        _engine = DataTriggerEngine()
    return _engine


def reset_engine() -> None:
    global _engine
    _engine = None
