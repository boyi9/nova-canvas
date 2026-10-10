"""审计归档 Worker：定期将 ≥180 天的审计记录归档到对象存储。"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from typing import Optional

from .handoff_audit import get_audit_log, HandoffAuditLog


def archive_audit_log(
    audit_log: Optional[HandoffAuditLog] = None,
    storage_backend: Optional[Any] = None,
) -> int:
    """归档过期审计记录。

    Args:
        audit_log: 审计日志实例，默认使用全局单例
        storage_backend: 对象存储后端（需实现 put_object 方法），默认写入本地文件

    Returns:
        归档的记录数
    """
    audit_log = audit_log or get_audit_log()
    expired = audit_log.archive_expired()

    if not expired:
        return 0

    # 按任务分组归档
    by_task = {}
    for entry in expired:
        by_task.setdefault(entry.task_id, []).append(entry.to_dict())

    for task_id, entries in by_task.items():
        archive_data = {
            "task_id": task_id,
            "archived_at": datetime.now().isoformat(),
            "retention_days": audit_log.retention_days,
            "entries": entries,
        }

        if storage_backend:
            # 生产环境：上传到 MinIO/S3
            key = f"audit-archives/{task_id}/{datetime.now().strftime('%Y%m%d')}.json"
            storage_backend.put_object(
                Bucket=os.getenv("AUDIT_ARCHIVE_BUCKET", "nova-canvas-audit"),
                Key=key,
                Body=json.dumps(archive_data, ensure_ascii=False).encode("utf-8"),
            )
        else:
            # 开发环境：写入本地文件
            archive_dir = os.getenv("AUDIT_ARCHIVE_DIR", "/tmp/nova_canvas/audit_archives")
            os.makedirs(archive_dir, exist_ok=True)
            filepath = os.path.join(archive_dir, f"{task_id}_{datetime.now().strftime('%Y%m%d')}.json")
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(archive_data, f, ensure_ascii=False, indent=2)

    return len(expired)


def run_retention_worker(
    interval_hours: int = 24,
    storage_backend: Optional[Any] = None,
    once: bool = False,
) -> None:
    """运行审计保留 Worker。

    Args:
        interval_hours: 运行间隔（小时）
        storage_backend: 对象存储后端
        once: 是否只运行一次（用于测试）
    """
    import time
    import signal

    shutdown = False

    def _signal_handler(signum, frame):
        nonlocal shutdown
        shutdown = True

    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    while not shutdown:
        try:
            count = archive_audit_log(storage_backend=storage_backend)
            print(f"[{datetime.now()}] Archived {count} audit entries")
        except Exception as e:
            print(f"[{datetime.now()}] Audit retention worker error: {e}")

        if once:
            break

        for _ in range(interval_hours * 3600):
            if shutdown:
                break
            time.sleep(1)


if __name__ == "__main__":
    # 单次运行模式，用于测试或定时任务
    run_retention_worker(once=True)