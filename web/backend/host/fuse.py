"""四道熔断：连续失败/异常掉量/违规预警/预算超限 -> 自动降级 L2。"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from .matrix_manager import get_matrix_manager, MatrixManager
from .hosting_policy import DEFAULT_LEVEL
from .account_metrics import get_metrics_store, reset_metrics_store
from web.backend.services.db import Database

# 熔断记录持久化 namespace（重启后冷却状态不丢，避免反复触发）
NS_FUSE = "host.fuse"


class FuseType(Enum):
    CONSECUTIVE_FAILURE = "consecutive_failure"
    ABNORMAL_DROP = "abnormal_drop"
    RULE_ALERT_P0 = "rule_alert_p0"
    BUDGET_OVERFLOW = "budget_overflow"


class FuseState(Enum):
    CLOSED = "closed"      # 正常
    OPEN = "open"          # 熔断触发
    HALF_OPEN = "half_open"  # 尝试恢复


@dataclass
class FuseConfig:
    """熔断配置。"""
    threshold: Any
    action: str
    cooldown_seconds: int = 3600  # 冷却期 1 小时
    auto_recover: bool = False    # 是否自动恢复


@dataclass
class FuseRecord:
    """熔断记录。"""
    fuse_type: FuseType
    account_id: str
    triggered_at: str
    state: FuseState = FuseState.OPEN
    trigger_reason: str = ""
    trigger_value: Any = None
    recovered_at: Optional[str] = None
    recovery_reason: str = ""


# 默认熔断规则
DEFAULT_FUSE_RULES = {
    FuseType.CONSECUTIVE_FAILURE: FuseConfig(
        threshold=3,
        action="downgrade_to_L2",
        cooldown_seconds=3600,
        auto_recover=False,
    ),
    FuseType.ABNORMAL_DROP: FuseConfig(
        threshold=40,  # 掉量 40%
        action="downgrade_to_L2",
        cooldown_seconds=1800,
        auto_recover=True,
    ),
    FuseType.RULE_ALERT_P0: FuseConfig(
        threshold=None,  # 任意 P0 触发
        action="downgrade_to_L2",
        cooldown_seconds=7200,
        auto_recover=False,
    ),
    FuseType.BUDGET_OVERFLOW: FuseConfig(
        threshold=120,  # 120% 预算
        action="downgrade_to_L2",
        cooldown_seconds=86400,  # 次日自动恢复
        auto_recover=True,
    ),
}


class FuseManager:
    """熔断管理器。"""

    def __init__(self, matrix_manager: Optional[Any] = None, persist: bool = False):
        """
        :param persist: 是否落 SQLite。应用单例（get_fuse_manager）传 True，
            使冷却期/半开状态跨重启有效；按需创建的实例默认 False 保持隔离。
        """
        self._matrix = matrix_manager or get_matrix_manager()
        self._fuses: Dict[str, FuseRecord] = {}  # key: f"{account_id}:{fuse_type}"
        self._rules: Dict[FuseType, FuseConfig] = DEFAULT_FUSE_RULES.copy()
        self._monitors: Dict[FuseType, Callable] = {}
        self.persist = persist
        if self.persist:
            self._load_fuses()

    def register_monitor(self, fuse_type: FuseType, monitor: Callable[[str], Dict[str, Any]]) -> None:
        """注册监控函数：输入 account_id，返回检测指标。"""
        self._monitors[fuse_type] = monitor

    def check_fuse(self, account_id: str, fuse_type: FuseType) -> bool:
        """检查并触发熔断，返回是否触发。"""
        monitor = self._monitors.get(fuse_type)
        if not monitor:
            return False

        metrics = monitor(account_id)
        config = self._rules.get(fuse_type)
        if not config:
            return False

        key = f"{account_id}:{fuse_type.value}"
        existing = self._fuses.get(key)

        # 检查冷却期
        if existing and existing.state == FuseState.OPEN:
            triggered = datetime.fromisoformat(existing.triggered_at)
            if (datetime.now() - triggered).total_seconds() < config.cooldown_seconds:
                return False  # 仍在冷却期
            if config.auto_recover:
                # 冷却期过，尝试半开恢复
                existing.state = FuseState.HALF_OPEN

        triggered = False
        reason = ""
        value = None

        if fuse_type == FuseType.CONSECUTIVE_FAILURE:
            failures = metrics.get("consecutive_failures", 0)
            value = failures
            if failures >= config.threshold:
                triggered = True
                reason = f"连续失败 {failures} 次（阈值 {config.threshold}）"

        elif fuse_type == FuseType.ABNORMAL_DROP:
            drop_pct = metrics.get("drop_pct", 0)
            value = drop_pct
            if drop_pct >= config.threshold:
                triggered = True
                reason = f"近 5 条平均播放量低于 30 天均值 {drop_pct}%（阈值 {config.threshold}%）"

        elif fuse_type == FuseType.RULE_ALERT_P0:
            p0_alerts = metrics.get("p0_alerts", 0)
            value = p0_alerts
            if p0_alerts > 0:
                triggered = True
                reason = f"规则雷达报出 {p0_alerts} 条 P0 级违规风险"

        elif fuse_type == FuseType.BUDGET_OVERFLOW:
            overflow_pct = metrics.get("budget_overflow_pct", 0)
            value = overflow_pct
            if overflow_pct >= config.threshold:
                triggered = True
                reason = f"当日模型/API 花费超日预算 {overflow_pct}%（阈值 {config.threshold}%）"

        if triggered:
            record = FuseRecord(
                fuse_type=fuse_type,
                account_id=account_id,
                triggered_at=datetime.now().isoformat(),
                state=FuseState.OPEN,
                trigger_reason=reason,
                trigger_value=value,
            )
            self._fuses[key] = record
            self._save_fuse(key, record)
            self._execute_action(account_id, config.action, reason)
            return True

        return False

    # ── 持久化 ────────────────────────────────────────────────────────────
    def _save_fuse(self, key: str, record: FuseRecord) -> None:
        """熔断记录落盘，保证冷却期/半开状态跨重启有效。"""
        if not self.persist:
            return
        try:
            Database.instance().put(
                NS_FUSE,
                key,
                {
                    "fuse_type": record.fuse_type.value,
                    "account_id": record.account_id,
                    "triggered_at": record.triggered_at,
                    "state": record.state.value,
                    "trigger_reason": record.trigger_reason,
                    "trigger_value": record.trigger_value,
                    "recovered_at": record.recovered_at,
                    "recovery_reason": record.recovery_reason,
                },
            )
        except Exception:
            pass

    def _load_fuses(self) -> None:
        """从 SQLite 恢复熔断记录。"""
        try:
            for item in Database.instance().list(NS_FUSE):
                key = item.pop("_id", None)
                if not key:
                    continue
                record = FuseRecord(
                    fuse_type=FuseType(item["fuse_type"]),
                    account_id=item["account_id"],
                    triggered_at=item["triggered_at"],
                    state=FuseState(item.get("state", "open")),
                    trigger_reason=item.get("trigger_reason", ""),
                    trigger_value=item.get("trigger_value"),
                    recovered_at=item.get("recovered_at"),
                    recovery_reason=item.get("recovery_reason", ""),
                )
                self._fuses[key] = record
        except Exception:
            self._fuses = {}

    def _execute_action(self, account_id: str, action: str, reason: str) -> None:
        """执行熔断动作（降级、停止自动动作等）。"""
        if action != "downgrade_to_L2":
            return
        matrix = self._matrix
        # 通过公开方法定位账号，避免直接访问私有字典
        target = None
        getter = getattr(matrix, "get_account", None)
        if callable(getter):
            target = getter(account_id)
        if target is None:
            accounts = getattr(matrix, "list_all_accounts", None)
            if callable(accounts):
                for acc in accounts():
                    if getattr(acc, "id", None) == account_id:
                        target = acc
                        break
        if target is not None:
            target.hosting_level = "L2"
            target.status = "paused"
            print(f"[FUSE] Account {account_id} downgraded to L2: {reason}")

    def check_all_fuses(self, account_id: str) -> List[FuseType]:
        """检查所有类型熔断，返回触发的类型列表。"""
        triggered = []
        for fuse_type in FuseType:
            if self.check_fuse(account_id, fuse_type):
                triggered.append(fuse_type)
        return triggered

    def get_fuse_status(self, account_id: str) -> Dict[str, Any]:
        """获取账号的所有熔断状态。"""
        status = {}
        for fuse_type in FuseType:
            key = f"{account_id}:{fuse_type.value}"
            record = self._fuses.get(key)
            if record:
                status[fuse_type.value] = {
                    "state": record.state.value,
                    "triggered_at": record.triggered_at,
                    "reason": record.trigger_reason,
                    "value": record.trigger_value,
                    "recovered_at": record.recovered_at,
                }
            else:
                status[fuse_type.value] = {"state": "closed"}
        return status

    def try_recover(self, account_id: str, fuse_type: FuseType) -> bool:
        """尝试恢复熔断（人工调用）。"""
        key = f"{account_id}:{fuse_type.value}"
        record = self._fuses.get(key)
        if not record or record.state != FuseState.OPEN:
            return False

        config = self._rules.get(fuse_type)
        if not config:
            return False

        # 检查恢复条件
        monitor = self._monitors.get(fuse_type)
        if monitor:
            metrics = monitor(account_id)
            recovered = False
            recovery_reason = ""

            if fuse_type == FuseType.CONSECUTIVE_FAILURE:
                if metrics.get("consecutive_failures", 0) == 0:
                    recovered = True
                    recovery_reason = "连续失败已清零"
            elif fuse_type == FuseType.ABNORMAL_DROP:
                if metrics.get("consecutive_recovered", 0) >= 3:
                    recovered = True
                    recovery_reason = "连续 3 条内容恢复正常"
            elif fuse_type == FuseType.RULE_ALERT_P0:
                if metrics.get("p0_alerts", 0) == 0:
                    recovered = True
                    recovery_reason = "风险整改并通过复检"
            elif fuse_type == FuseType.BUDGET_OVERFLOW:
                # 预算超限次日自动恢复
                if datetime.now().date() > datetime.fromisoformat(record.triggered_at).date():
                    recovered = True
                    recovery_reason = "次日自动恢复"

            if recovered:
                record.state = FuseState.CLOSED
                record.recovered_at = datetime.now().isoformat()
                record.recovery_reason = recovery_reason
                # 恢复托管级别
                matrix = get_matrix_manager()
                for acc in matrix._accounts.values():
                    if acc.id == account_id and acc.hosting_level == "L2":
                        # 仅当因熔断降级时恢复（需记录原级别）
                        pass
                return True
        return False

    def get_active_fuses(self) -> List[FuseRecord]:
        """获取所有激活的熔断记录。"""
        return [r for r in self._fuses.values() if r.state == FuseState.OPEN]


# 全局熔断管理器
_fuse_manager: Optional[FuseManager] = None


def get_fuse_manager() -> FuseManager:
    global _fuse_manager
    if _fuse_manager is None:
        _fuse_manager = FuseManager(persist=True)
        register_default_monitors(_fuse_manager)
    return _fuse_manager


def reset_fuse_manager() -> None:
    """测试用：重置单例并清空持久化的熔断记录。"""
    global _fuse_manager
    _fuse_manager = None
    try:
        Database.instance().clear(NS_FUSE)
    except Exception:
        pass


def run_fuse_monitor_worker(interval_seconds: int = 300, once: bool = False) -> None:
    """熔断监控 Worker（5 分钟轮询）。"""
    manager = get_fuse_manager()

    import signal
    shutdown = False

    def _signal_handler(signum, frame):
        nonlocal shutdown
        shutdown = True

    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    while not shutdown:
        try:
            # 遍历所有活跃账号检查熔断
            matrix = get_matrix_manager()
            for account in matrix._accounts.values():
                if account.status in ("active", "paused"):
                    manager.check_all_fuses(account.id)

            # 输出激活的熔断
            active = manager.get_active_fuses()
            if active:
                print(f"[{datetime.now()}] Active fuses: {len(active)}")
                for f in active:
                    print(f"  - {f.account_id}: {f.fuse_type.value} - {f.trigger_reason}")

        except Exception as e:
            print(f"[{datetime.now()}] Fuse monitor error: {e}")

        if once:
            break
        time.sleep(interval_seconds)


# 默认监控函数：接入真实指标源（host/account_metrics.py）
def default_failure_monitor(account_id: str) -> Dict[str, Any]:
    """连续失败监控：从账号任务事件流统计最近一段连续失败数。"""
    return {"consecutive_failures": get_metrics_store().consecutive_failures(account_id)}


def default_drop_monitor(account_id: str) -> Dict[str, Any]:
    """异常掉量监控：近 5 条平均播放 vs 近 30 天基线。数据不足时返回 0。"""
    store = get_metrics_store()
    baseline = store.views_baseline(account_id)
    recent = store.views_recent(account_id)
    return {
        "drop_pct": store.drop_pct(account_id),
        "baseline_views": round(baseline, 2) if baseline else None,
        "recent_views": round(recent, 2) if recent else None,
        "consecutive_recovered": 0,
    }


def default_rule_alert_monitor(account_id: str) -> Dict[str, Any]:
    """违规预警监控：统计该账号 P0 级违规告警条数。"""
    return {"p0_alerts": get_metrics_store().p0_alerts(account_id)}


def default_budget_monitor(account_id: str) -> Dict[str, Any]:
    """预算超限监控：当日累计花费 / 日预算。无预算配置返回 0。"""
    store = get_metrics_store()
    return {
        "budget_overflow_pct": store.budget_overflow_pct(account_id),
        "cost_today_cny": store.cost_today(account_id),
        "daily_budget_cny": store.daily_budget(account_id),
    }


def register_default_monitors(manager: Optional[FuseManager] = None) -> FuseManager:
    """把 4 个默认监控绑定到熔断管理器（应用启动时调用）。"""
    mgr = manager or get_fuse_manager()
    mgr.register_monitor(FuseType.CONSECUTIVE_FAILURE, default_failure_monitor)
    mgr.register_monitor(FuseType.ABNORMAL_DROP, default_drop_monitor)
    mgr.register_monitor(FuseType.RULE_ALERT_P0, default_rule_alert_monitor)
    mgr.register_monitor(FuseType.BUDGET_OVERFLOW, default_budget_monitor)
    return mgr


if __name__ == "__main__":
    # Demo
    import signal
    manager = FuseManager()

    # 注册默认监控
    manager.register_monitor(FuseType.CONSECUTIVE_FAILURE, default_failure_monitor)
    manager.register_monitor(FuseType.ABNORMAL_DROP, default_drop_monitor)
    manager.register_monitor(FuseType.RULE_ALERT_P0, default_rule_alert_monitor)
    manager.register_monitor(FuseType.BUDGET_OVERFLOW, default_budget_monitor)

    # 模拟触发
    account_id = "test_account"

    # 模拟连续失败
    def mock_fail_monitor(aid):
        return {"consecutive_failures": 3}

    manager.register_monitor(FuseType.CONSECUTIVE_FAILURE, mock_fail_monitor)
    triggered = manager.check_fuse(account_id, FuseType.CONSECUTIVE_FAILURE)
    print(f"Triggered: {triggered}")

    # 查看状态
    status = manager.get_fuse_status(account_id)
    print(f"Fuse status: {status}")

    # 运行一次监控
    run_fuse_monitor_worker(interval_seconds=10, once=True)