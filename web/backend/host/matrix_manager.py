"""多账号矩阵与安全策略：环境隔离、发布节奏抖动、配额管理、新号保护期。"""
from __future__ import annotations

import os
import random
import secrets
import yaml
from dataclasses import dataclass, asdict, field
from datetime import datetime, timedelta, time
from typing import Dict, List, Optional, Any
from pathlib import Path


@dataclass
class SafetyDefaults:
    """安全默认值（用户不可改到更危险的值）。"""
    publish_interval_min: int = 30      # 分钟
    publish_interval_max: int = 120
    publish_jitter_min: int = 25        # ±分钟
    daily_publish_cap: int = 5
    new_account_protection_days: int = 7
    same_asset_reprocess_required: bool = True
    env_isolation_required: bool = True
    avoid_whole_hour: bool = True       # 避开整点发布
    max_concurrent_publish: int = 1     # 单账号并发发布数

    # 类级别最小安全值（用于验证）
    _MIN_DEFAULTS = {
        "publish_interval_min": 30,
        "publish_interval_max": 120,
        "publish_jitter_min": 25,
        "daily_publish_cap": 1,
        "new_account_protection_days": 7,
    }
    _BOOL_DEFAULTS = {
        "same_asset_reprocess_required": True,
        "env_isolation_required": True,
        "avoid_whole_hour": True,
    }

    def __post_init__(self):
        # 验证：确保不低于最小安全值
        for k, v in self._MIN_DEFAULTS.items():
            current = getattr(self, k)
            if isinstance(v, int) and isinstance(current, int):
                if current < v:
                    raise ValueError(f"{k} cannot be lower than safety minimum: {v}")

        # 验证布尔安全项：不能从 True 改为 False
        for k, v in self._BOOL_DEFAULTS.items():
            current = getattr(self, k)
            if isinstance(v, bool) and isinstance(current, bool):
                if v is True and current is False:
                    raise ValueError(f"{k} cannot be disabled (safety requirement)")

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class AccountHealth:
    """账号健康度。"""
    account_id: str
    status: str = "healthy"  # healthy / warning / critical / frozen
    last_publish_at: Optional[str] = None
    consecutive_failures: int = 0
    recent_ctr_avg: float = 0.0
    recent_gmv_avg: float = 0.0
    violation_count: int = 0
    risk_score: int = 0  # 0-100
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class MatrixAccount:
    """矩阵账号。"""
    id: str
    user_id: str
    platform: str
    platform_account_id: str
    username: str
    display_name: str
    auth_id: str  # 关联 AccountAuthorization
    hosting_level: str = "L2"  # L0/L1/L2/L3/L4
    safety_overrides: Dict[str, Any] = field(default_factory=dict)
    health: Optional[AccountHealth] = None
    device_fingerprint: str = ""  # 设备指纹
    ip_pool: List[str] = field(default_factory=list)
    status: str = "active"  # active / paused / frozen / archived
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    last_publish_at: Optional[str] = None
    total_published: int = 0

    def get_safety_config(self, defaults: SafetyDefaults) -> Dict[str, Any]:
        """合并默认值与覆盖值。"""
        config = defaults.to_dict()
        config.update(self.safety_overrides)
        return config


def _load_yaml(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


# 加载安全默认配置
_CONFIG_DIR = Path(__file__).parent / "data"
_SAFETY_DEFAULTS = _load_yaml(_CONFIG_DIR / "safety_defaults.yaml")


def get_safety_defaults() -> SafetyDefaults:
    return SafetyDefaults(**_SAFETY_DEFAULTS.get("safety_defaults", {}))


def get_fuse_rules() -> dict:
    return _SAFETY_DEFAULTS.get("fuse_rules", {})


class MatrixManager:
    """多账号矩阵管理器。"""

    def __init__(self):
        self._accounts: Dict[str, MatrixAccount] = {}
        self._defaults = get_safety_defaults()
        self._fuse_rules = get_fuse_rules()

    def add_account(
        self,
        user_id: str,
        platform: str,
        platform_account_id: str,
        username: str,
        display_name: str,
        auth_id: str,
        device_fingerprint: str = "",
        ip_pool: Optional[List[str]] = None,
        hosting_level: str = "L2",
    ) -> MatrixAccount:
        """添加账号到矩阵。"""
        # 验证环境隔离
        if self._defaults.env_isolation_required:
            for acc in self._accounts.values():
                if acc.user_id == user_id and acc.platform == platform:
                    if acc.device_fingerprint == device_fingerprint and device_fingerprint:
                        raise ValueError(
                            f"Environment isolation required: account {acc.id} "
                            f"already uses this device fingerprint"
                        )
                    if set(acc.ip_pool) & set(ip_pool or []):
                        raise ValueError(
                            f"IP overlap detected with account {acc.id}"
                        )

        account = MatrixAccount(
            id=f"macc_{secrets.token_urlsafe(12)}",
            user_id=user_id,
            platform=platform,
            platform_account_id=platform_account_id,
            username=username,
            display_name=display_name,
            auth_id=auth_id,
            hosting_level=hosting_level,
            device_fingerprint=device_fingerprint or secrets.token_hex(16),
            ip_pool=ip_pool or [],
        )
        account.health = AccountHealth(account_id=account.id)
        self._accounts[account.id] = account
        return account

    def get_account(self, account_id: str) -> Optional[MatrixAccount]:
        return self._accounts.get(account_id)

    def list_user_accounts(self, user_id: str) -> List[MatrixAccount]:
        return [a for a in self._accounts.values() if a.user_id == user_id]

    def list_platform_accounts(self, user_id: str, platform: str) -> List[MatrixAccount]:
        return [a for a in self._accounts.values()
                if a.user_id == user_id and a.platform == platform]

    def update_safety_overrides(
        self,
        account_id: str,
        overrides: Dict[str, Any],
    ) -> MatrixAccount:
        """更新安全策略覆盖（只能更严格，不能更宽松）。"""
        account = self._accounts.get(account_id)
        if not account:
            raise ValueError("Account not found")

        # 验证覆盖值不低于安全最小值
        for key, value in overrides.items():
            if not hasattr(self._defaults, key):
                raise ValueError(f"Unknown safety config: {key}")
            default_val = getattr(self._defaults, key)
            # 先检查 bool（因为 bool 是 int 的子类）
            if isinstance(default_val, bool) and isinstance(value, bool):
                if default_val is True and value is False:
                    raise ValueError(f"{key} cannot be disabled (safety requirement)")
            elif isinstance(default_val, int) and isinstance(value, int):
                if value < default_val:
                    raise ValueError(
                        f"{key} cannot be lower than safety minimum: {default_val}"
                    )

        account.safety_overrides.update(overrides)
        return account

    def get_publish_window(
        self,
        account: MatrixAccount,
        preferred_time: Optional[time] = None,
    ) -> datetime:
        """计算实际发布时间（带抖动、避开整点）。"""
        config = account.get_safety_config(self._defaults)

        now = datetime.now()
        base_time = now.replace(hour=preferred_time.hour if preferred_time else 19,
                                minute=preferred_time.minute if preferred_time else 0,
                                second=0, microsecond=0)
        if base_time <= now:
            base_time += timedelta(days=1)

        # 抖动
        jitter = random.randint(-config["publish_jitter_min"], config["publish_jitter_min"])
        publish_time = base_time + timedelta(minutes=jitter)

        # 避开整点
        if config["avoid_whole_hour"] and publish_time.minute == 0:
            publish_time += timedelta(minutes=random.randint(3, 25))

        # 确保在配额内
        if not self._check_daily_cap(account):
            # 推到明天
            publish_time += timedelta(days=1)
            publish_time = publish_time.replace(hour=10, minute=random.randint(0, 30))

        return publish_time

    def _check_daily_cap(self, account: MatrixAccount) -> bool:
        """检查今日发布配额。"""
        config = account.get_safety_config(self._defaults)
        today = datetime.now().date()
        # 简化：实际应查数据库
        return account.total_published < config["daily_publish_cap"]

    def can_publish(self, account_id: str) -> Dict[str, Any]:
        """检查是否可以发布。"""
        account = self._accounts.get(account_id)
        if not account:
            return {"allowed": False, "reason": "Account not found"}
        if account.status != "active":
            return {"allowed": False, "reason": f"Account status: {account.status}"}

        # 新号保护期
        config = account.get_safety_config(self._defaults)
        days_since_created = (datetime.now() - datetime.fromisoformat(account.created_at)).days
        if days_since_created < config["new_account_protection_days"]:
            return {
                "allowed": False,
                "reason": f"New account protection period ({config['new_account_protection_days']} days)",
                "protection_ends": (datetime.fromisoformat(account.created_at) +
                                   timedelta(days=config["new_account_protection_days"])).isoformat(),
            }

        # 配额检查
        if not self._check_daily_cap(account):
            return {"allowed": False, "reason": "Daily publish cap reached"}

        # 健康度检查
        if account.health and account.health.status == "frozen":
            return {"allowed": False, "reason": "Account frozen"}

        # 连续失败
        if account.health and account.health.consecutive_failures >= 3:
            return {"allowed": False, "reason": "Too many consecutive failures"}

        return {"allowed": True}

    def record_publish(self, account_id: str, success: bool, asset_hash: str = "") -> None:
        """记录发布结果。"""
        account = self._accounts.get(account_id)
        if not account:
            return

        account.last_publish_at = datetime.now().isoformat()
        account.total_published += 1

        if account.health:
            if success:
                account.health.consecutive_failures = 0
            else:
                account.health.consecutive_failures += 1

        # 同素材跨账号强制二次加工检查
        if self._defaults.same_asset_reprocess_required and asset_hash:
            # 实际应查询该素材在其他账号的使用情况
            pass

    def update_health(self, account_id: str, metrics: Dict[str, Any]) -> None:
        """更新账号健康度（定时任务调用）。"""
        account = self._accounts.get(account_id)
        if not account or not account.health:
            return

        health = account.health
        health.recent_ctr_avg = metrics.get("ctr_avg", health.recent_ctr_avg)
        health.recent_gmv_avg = metrics.get("gmv_avg", health.recent_gmv_avg)
        health.violation_count = metrics.get("violation_count", health.violation_count)
        health.last_publish_at = account.last_publish_at
        health.updated_at = datetime.now().isoformat()

        # 计算风险分
        risk = 0
        if health.recent_ctr_avg < 0.02:  # CTR < 2%
            risk += 20
        if health.recent_gmv_avg < 100:  # 单条 GMV < 100
            risk += 15
        if health.violation_count > 0:
            risk += health.violation_count * 10
        if health.consecutive_failures > 0:
            risk += health.consecutive_failures * 5
        health.risk_score = min(100, risk)

        # 状态判定
        if risk >= 70:
            health.status = "critical"
        elif risk >= 40:
            health.status = "warning"
        else:
            health.status = "healthy"

    def get_matrix_overview(self, user_id: str) -> Dict[str, Any]:
        """获取矩阵总览（驾驶舱用）。"""
        accounts = self.list_user_accounts(user_id)
        overview = {
            "total": len(accounts),
            "active": sum(1 for a in accounts if a.status == "active"),
            "paused": sum(1 for a in accounts if a.status == "paused"),
            "frozen": sum(1 for a in accounts if a.status == "frozen"),
            "by_platform": {},
            "by_level": {},
            "health_distribution": {"healthy": 0, "warning": 0, "critical": 0, "frozen": 0},
            "quota_usage": [],
        }

        for acc in accounts:
            # 平台分布
            overview["by_platform"][acc.platform] = overview["by_platform"].get(acc.platform, 0) + 1
            # 托管级别
            overview["by_level"][acc.hosting_level] = overview["by_level"].get(acc.hosting_level, 0) + 1
            # 健康度
            if acc.health:
                overview["health_distribution"][acc.health.status] = overview["health_distribution"].get(acc.health.status, 0) + 1

            # 配额
            config = acc.get_safety_config(self._defaults)
            overview["quota_usage"].append({
                "account_id": acc.id,
                "username": acc.username,
                "platform": acc.platform,
                "used_today": acc.total_published,  # 简化
                "cap": config["daily_publish_cap"],
                "level": acc.hosting_level,
                "health": acc.health.status if acc.health else "unknown",
            })

        return overview

    def check_env_isolation(self, account_id: str) -> Dict[str, Any]:
        """检查环境隔离状态。"""
        account = self._accounts.get(account_id)
        if not account:
            return {"isolated": False, "reason": "Account not found"}

        issues = []
        for other in self._accounts.values():
            if other.id == account.id:
                continue
            if other.user_id == account.user_id and other.platform == account.platform:
                if other.device_fingerprint == account.device_fingerprint:
                    issues.append(f"Shared device fingerprint with {other.id}")
                if set(other.ip_pool) & set(account.ip_pool):
                    issues.append(f"IP overlap with {other.id}")

        return {
            "isolated": len(issues) == 0,
            "issues": issues,
            "device_fingerprint": account.device_fingerprint[:8] + "...",
            "ip_pool": account.ip_pool,
        }


# 全局矩阵管理器
_matrix_manager: Optional["MatrixManager"] = None


def get_matrix_manager() -> MatrixManager:
    global _matrix_manager
    if _matrix_manager is None:
        _matrix_manager = MatrixManager()
    return _matrix_manager


if __name__ == "__main__":
    import secrets
    mgr = MatrixManager()

    # 添加测试账号
    acc1 = mgr.add_account(
        user_id="user_001",
        platform="douyin",
        platform_account_id="dy_12345",
        username="brand_official",
        display_name="品牌官方号",
        auth_id="auth_001",
        device_fingerprint="device_abc123",
        ip_pool=["1.2.3.4"],
    )
    print(f"Added: {acc1.id} - {acc1.display_name}")

    # 检查发布窗口
    pub_time = mgr.get_publish_window(acc1)
    print(f"Next publish window: {pub_time}")

    # 安全配置
    print(f"Safety config: {acc1.get_safety_config(mgr._defaults)}")

    # 尝试设置更危险的值（应报错）
    try:
        mgr.update_safety_overrides(acc1.id, {"publish_interval_min": 5})
    except ValueError as e:
        print(f"Expected error: {e}")

    # 矩阵总览
    overview = mgr.get_matrix_overview("user_001")
    print(f"Matrix overview: {overview}")