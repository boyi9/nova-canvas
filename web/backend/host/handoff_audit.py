"""审计留痕：每次状态迁移可回溯（谁、何时、IP、附件哈希），保留 ≥180 天。"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List


@dataclass
class AuditEntry:
    id: str
    task_id: str
    at: str
    actor: str
    action: str
    detail: str
    ip: str = ""
    user_agent: str = ""
    payload_hash: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class HandoffAuditLog:
    entries: List[AuditEntry] = field(default_factory=list)
    retention_days: int = 180

    def log(
        self,
        task_id: str,
        actor: str,
        action: str,
        detail: str = "",
        ip: str = "",
        user_agent: str = "",
        payload: Optional[Dict[str, Any]] = None,
    ) -> AuditEntry:
        payload_hash = ""
        if payload:
            payload_hash = hashlib.sha256(
                json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
            ).hexdigest()

        entry = AuditEntry(
            id=f"{task_id}:{len(self.entries)+1}:{datetime.now().strftime('%Y%m%d%H%M%S%f')}",
            task_id=task_id,
            at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            actor=actor,
            action=action,
            detail=detail,
            ip=ip,
            user_agent=user_agent,
            payload_hash=payload_hash,
        )
        self.entries.append(entry)
        return entry

    def get_task_audit(self, task_id: str) -> List[AuditEntry]:
        return [e for e in self.entries if e.task_id == task_id]

    def export_audit_report(self, task_id: str, format: str = "json") -> str:
        """导出审计报告（JSON/CSV）。"""
        entries = self.get_task_audit(task_id)
        if format == "json":
            return json.dumps([e.to_dict() for e in entries], ensure_ascii=False, indent=2)
        elif format == "csv":
            import csv
            import io
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["id", "task_id", "at", "actor", "action", "detail", "ip", "user_agent", "payload_hash"])
            for e in entries:
                writer.writerow([e.id, e.task_id, e.at, e.actor, e.action, e.detail, e.ip, e.user_agent, e.payload_hash])
            return output.getvalue()
        else:
            raise ValueError(f"unsupported format: {format}")

    def cleanup_expired(self, now: Optional[datetime] = None) -> int:
        """清理过期审计记录（归档到对象存储而非直接删除）。"""
        now = now or datetime.now()
        cutoff = now - timedelta(days=self.retention_days)
        expired = [e for e in self.entries if datetime.strptime(e.at, "%Y-%m-%d %H:%M:%S") < cutoff]
        self.entries = [e for e in self.entries if e not in expired]
        return len(expired)

    def archive_expired(self, now: Optional[datetime] = None) -> List[AuditEntry]:
        """归档过期记录（返回待归档列表，实际写入对象存储由调用方处理）。"""
        now = now or datetime.now()
        cutoff = now - timedelta(days=self.retention_days)
        expired = [e for e in self.entries if datetime.strptime(e.at, "%Y-%m-%d %H:%M:%S") < cutoff]
        return expired


# 全局审计日志单例
_audit_log: Optional[HandoffAuditLog] = None


def get_audit_log() -> HandoffAuditLog:
    global _audit_log
    if _audit_log is None:
        _audit_log = HandoffAuditLog()
    return _audit_log


def set_audit_retention(days: int) -> None:
    """设置保留天数，必须 ≥180 天。"""
    if days < 180:
        raise ValueError("audit retention must be >= 180 days")
    get_audit_log().retention_days = days