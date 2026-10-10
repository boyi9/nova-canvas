"""Host 模块：全栈托管与线下接缝引擎。"""
from .handoff_models import (
    HandoffType,
    HandoffState,
    HandoffTask,
    HandoffPolicy,
    SLA_HOURS,
    RED_LINE_TYPES,
    LEGAL_TRANSITIONS,
    validate_transition,
)
from .handoff_bus import HandoffBus, get_bus, create_task, dispatch, accept, submit, validate, resume, check_timeout, can_auto_downgrade
from .handoff_audit import HandoffAuditLog, AuditEntry, get_audit_log, set_audit_retention

__all__ = [
    "HandoffType",
    "HandoffState",
    "HandoffTask",
    "HandoffPolicy",
    "SLA_HOURS",
    "RED_LINE_TYPES",
    "LEGAL_TRANSITIONS",
    "validate_transition",
    "HandoffBus",
    "get_bus",
    "create_task",
    "dispatch",
    "accept",
    "submit",
    "validate",
    "resume",
    "check_timeout",
    "can_auto_downgrade",
    "HandoffAuditLog",
    "AuditEntry",
    "get_audit_log",
    "set_audit_retention",
]