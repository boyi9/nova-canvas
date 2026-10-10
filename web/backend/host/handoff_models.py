"""接缝任务模型：把线下动作与人工审查统一为可追踪对象。"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any


class HandoffType(str, Enum):
    SHOOT = "shoot"                  # 线下拍摄
    AUTHORIZE = "authorize"          # 肖像/声音授权
    SUPPLY = "supply"                # 补充素材
    REVIEW = "review"                # 内容审核
    FINAL_APPROVE = "final_approve"  # 发布终审


class HandoffState(str, Enum):
    CREATED = "created"
    DISPATCHED = "dispatched"
    IN_PROGRESS = "in_progress"
    RETURNED = "returned"
    VALIDATED = "validated"
    RESUMED = "resumed"
    REJECTED = "rejected"
    EXPIRED = "expired"


SLA_HOURS = {
    HandoffType.SHOOT: 48,
    HandoffType.AUTHORIZE: 24,
    HandoffType.SUPPLY: 24,
    HandoffType.REVIEW: 8,
    HandoffType.FINAL_APPROVE: 12,
}

RED_LINE_TYPES = {HandoffType.AUTHORIZE, HandoffType.FINAL_APPROVE}

LEGAL_TRANSITIONS = {
    HandoffState.CREATED: {HandoffState.DISPATCHED},
    HandoffState.DISPATCHED: {HandoffState.IN_PROGRESS, HandoffState.EXPIRED},
    HandoffState.IN_PROGRESS: {HandoffState.RETURNED, HandoffState.EXPIRED},
    HandoffState.RETURNED: {HandoffState.VALIDATED, HandoffState.REJECTED},
    HandoffState.VALIDATED: {HandoffState.RESUMED},
    HandoffState.REJECTED: {HandoffState.DISPATCHED},
}


@dataclass
class HandoffTask:
    task_id: str
    htype: HandoffType
    project_id: str
    title: str
    payload: Dict[str, Any] = field(default_factory=dict)
    assignee: str = ""
    state: HandoffState = HandoffState.CREATED
    created_at: str = ""
    sla_deadline: str = ""
    reminders: int = 0
    idempotency_keys: set = field(default_factory=set)
    audit: list = field(default_factory=list)

    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if not self.sla_deadline:
            hours = SLA_HOURS.get(self.htype, 24)
            self.sla_deadline = (
                datetime.now() + __import__('datetime').timedelta(hours=hours)
            ).strftime("%Y-%m-%d %H:%M:%S")

    def to_dict(self) -> dict:
        d = asdict(self)
        d["htype"] = self.htype.value
        d["state"] = self.state.value
        d["idempotency_keys"] = list(self.idempotency_keys)
        return d

    def _log(self, action: str, detail: str = "", actor: str = "system") -> None:
        self.audit.append({
            "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "actor": actor,
            "action": action,
            "detail": detail,
        })

    def _move(self, target: HandoffState) -> None:
        allowed = LEGAL_TRANSITIONS.get(self.state, set())
        if target not in allowed:
            raise ValueError(f"illegal transition {self.state.value} -> {target.value}")
        self.state = target
        self._log("transition", target.value)


@dataclass
class HandoffPolicy:
    htype: HandoffType
    sla_hours: int
    trigger_conditions: list
    deliverables: list
    timeout_downgrade: str
    allow_auto_downgrade: bool
    red_line: bool

    @classmethod
    def get_defaults(cls) -> Dict[HandoffType, "HandoffPolicy"]:
        return {
            HandoffType.SHOOT: cls(
                htype=HandoffType.SHOOT,
                sla_hours=48,
                trigger_conditions=["shot_manifest.source == live", "asset_bus.missing_live_asset"],
                deliverables=["video_clip", "shoot_metadata"],
                timeout_downgrade="ai_pickup",
                allow_auto_downgrade=True,
                red_line=False,
            ),
            HandoffType.AUTHORIZE: cls(
                htype=HandoffType.AUTHORIZE,
                sla_hours=24,
                trigger_conditions=["use_real_person_likeness", "use_voice_clone"],
                deliverables=["signed_release", "expiry_date"],
                timeout_downgrade="block_asset",
                allow_auto_downgrade=False,
                red_line=True,
            ),
            HandoffType.SUPPLY: cls(
                htype=HandoffType.SUPPLY,
                sla_hours=24,
                trigger_conditions=["missing_product_image", "missing_license_proof"],
                deliverables=["asset_file"],
                timeout_downgrade="placeholder",
                allow_auto_downgrade=True,
                red_line=False,
            ),
            HandoffType.REVIEW: cls(
                htype=HandoffType.REVIEW,
                sla_hours=8,
                trigger_conditions=["compliance_yellow_flag", "pre_publish_gate"],
                deliverables=["approved", "rejection_reason"],
                timeout_downgrade="hold_draft",
                allow_auto_downgrade=False,
                red_line=False,
            ),
            HandoffType.FINAL_APPROVE: cls(
                htype=HandoffType.FINAL_APPROVE,
                sla_hours=12,
                trigger_conditions=["enter_publish_queue"],
                deliverables=["confirm_publish", "schedule_change"],
                timeout_downgrade="requeue",
                allow_auto_downgrade=False,
                red_line=True,
            ),
        }


def validate_transition(current: HandoffState, target: HandoffState) -> bool:
    """验证状态迁移是否合法。"""
    return target in LEGAL_TRANSITIONS.get(current, set())