# -*- coding: utf-8 -*-
# file: backend/models/call_trace.py
# 作用：NC-CAP-10 留痕与可解释 —— 每次模型调用可追溯
# 13 个字段 + 保留期 ≥180 天
import time
import hashlib
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional


# 保留期：180 天（与规则雷达第 19 章一致）
RETENTION_DAYS = 180

# SQLite event_log 命名空间
_NS = "model.call_trace"


@dataclass
class CallTrace:
    """
    模型调用留痕记录（13 字段）。
    完整率 100%：所有字段必填（除可选的 model_version / prompt_version）。
    """
    task_id: str
    step_id: str
    input_type: str          # I1/I2/I3/I4
    operation: str           # create/optimize/adjust/repair/add/understand/evaluate
    control_mode: str        # M0-M4
    model_alias: str
    route_reason: str        # 路由理由（含硬约束+软评分）
    cost_cny: float          # 成本（元）
    latency_ms: float        # 延迟（毫秒）
    human_confirm: bool      # 是否人工确认
    output_hash: str         # 输出内容哈希
    model_version: str = ""  # 模型版本（可选）
    prompt_version: str = "" # 提示词版本（可选）
    traced_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def is_complete(self) -> bool:
        """留痕完整率检查：必填字段无缺失"""
        required = [
            self.task_id, self.step_id, self.input_type,
            self.operation, self.control_mode, self.model_alias,
            self.route_reason, self.output_hash,
        ]
        return all(bool(f) for f in required)


def compute_output_hash(output: Any) -> str:
    """计算输出内容哈希"""
    if output is None:
        return "null"
    if isinstance(output, str):
        raw = output
    elif isinstance(output, (bytes, bytearray)):
        raw = output.hex()
    else:
        raw = str(output)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


class CallTraceStore:
    """
    留痕存储：支持按 task_id 还原完整决策链。
    落 SQLite（event_log 追加流），重启不丢；读取走内存镜像。
    """

    def __init__(self, retention_days: int = RETENTION_DAYS):
        self.retention_days = retention_days
        self._traces: List[CallTrace] = []
        self._mirror = True  # 内存镜像用于快速读

    def _db(self):
        from web.backend.services.db import Database

        return Database.instance()

    def _persist(self, trace: CallTrace) -> None:
        """写入 SQLite 追加流。"""
        try:
            self._db().append_event(_NS, trace.to_dict(), event_id=trace.task_id)
        except Exception:
            # 落盘失败不应阻断主流程（留痕降级为仅内存）
            pass

    def record(self, trace: CallTrace) -> CallTrace:
        """记录一次调用留痕"""
        self._traces.append(trace)
        self._persist(trace)
        self._cleanup_expired()
        return trace

    def record_call(
        self,
        task_id: str,
        step_id: str,
        input_type: str,
        operation: str,
        control_mode: str,
        model_alias: str,
        route_reason: str,
        cost_cny: float,
        latency_ms: float,
        human_confirm: bool,
        output: Any,
        model_version: str = "",
        prompt_version: str = "",
    ) -> CallTrace:
        """便捷记录方法"""
        trace = CallTrace(
            task_id=task_id,
            step_id=step_id,
            input_type=input_type,
            operation=operation,
            control_mode=control_mode,
            model_alias=model_alias,
            route_reason=route_reason,
            cost_cny=cost_cny,
            latency_ms=latency_ms,
            human_confirm=human_confirm,
            output_hash=compute_output_hash(output),
            model_version=model_version,
            prompt_version=prompt_version,
        )
        return self.record(trace)

    def by_task_id(self, task_id: str) -> List[CallTrace]:
        """按 task_id 还原完整决策链"""
        return [t for t in self._traces if t.task_id == task_id]

    def by_model(self, model_alias: str) -> List[CallTrace]:
        return [t for t in self._traces if t.model_alias == model_alias]

    def recent(self, limit: int = 50) -> List[CallTrace]:
        return self._traces[-limit:]

    def completeness_rate(self) -> float:
        """留痕完整率"""
        if not self._traces:
            return 1.0
        complete = sum(1 for t in self._traces if t.is_complete())
        return complete / len(self._traces)

    def total_cost(self) -> float:
        return sum(t.cost_cny for t in self._traces)

    def _cleanup_expired(self) -> None:
        """清理超过保留期的记录（内存镜像）"""
        cutoff = datetime.now() - timedelta(days=self.retention_days)
        self._traces = [
            t for t in self._traces
            if datetime.fromisoformat(t.traced_at) >= cutoff
        ]

    def size(self) -> int:
        return len(self._traces)

    def reload_from_db(self) -> int:
        """从 SQLite 恢复留痕到内存镜像，返回载入条数。"""
        try:
            rows = self._db().read_events(_NS, limit=100000)
        except Exception:
            return 0
        loaded: List[CallTrace] = []
        for item in rows:
            item.pop("_id", None)
            item.pop("_created_at", None)
            fields = {k: v for k, v in item.items() if k in CallTrace.__dataclass_fields__}
            if fields.get("task_id"):
                loaded.append(CallTrace(**fields))
        loaded.sort(key=lambda t: t.traced_at)
        self._traces = loaded
        return len(loaded)


# 全局单例
_store: Optional[CallTraceStore] = None


def get_store() -> CallTraceStore:
    global _store
    if _store is None:
        _store = CallTraceStore()
        _store.reload_from_db()
    return _store


def reset_store() -> None:
    global _store
    _store = None
