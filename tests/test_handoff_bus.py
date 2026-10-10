"""接缝总线单元测试。"""
import pytest
from datetime import datetime, timedelta

from web.backend.host.handoff_models import (
    HandoffType,
    HandoffState,
    HandoffTask,
    SLA_HOURS,
    RED_LINE_TYPES,
    LEGAL_TRANSITIONS,
    validate_transition,
)
from web.backend.host.handoff_bus import (
    create_task,
    dispatch,
    accept,
    submit,
    validate,
    resume,
    check_timeout,
    can_auto_downgrade,
    HandoffBus,
)
from web.backend.host.handoff_audit import get_audit_log, HandoffAuditLog


def test_create_task():
    """测试创建任务。"""
    task = create_task(
        task_id="TEST-001",
        htype=HandoffType.SHOOT,
        project_id="PRJ-001",
        title="拍摄任务卡 S01",
    )
    assert task.task_id == "TEST-001"
    assert task.htype == HandoffType.SHOOT
    assert task.project_id == "PRJ-001"
    assert task.state == HandoffState.CREATED
    assert task.sla_deadline != ""
    assert len(task.audit) == 1
    assert task.audit[0]["action"] == "created"


def test_normal_flow():
    """测试正常链路 create→dispatch→accept→submit→validate→resume。"""
    task = create_task("TEST-002", HandoffType.SHOOT, "PRJ-001", "测试任务")

    dispatch(task)
    assert task.state == HandoffState.DISPATCHED

    accept(task, "operator_1")
    assert task.state == HandoffState.IN_PROGRESS

    submit(task, {"video_clip": "s3://bucket/s01.mp4"}, "operator_1")
    assert task.state == HandoffState.RETURNED

    def validator(t):
        return "video_clip" in t.payload, "missing video_clip"

    validate(task, validator)
    assert task.state == HandoffState.VALIDATED

    downstream_called = []

    def downstream(t):
        downstream_called.append(True)

    resume(task, downstream)
    assert task.state == HandoffState.RESUMED
    assert len(downstream_called) == 1


def test_idempotent_submit():
    """测试幂等：重复 submit 同内容不重复执行下游。"""
    task = create_task("TEST-003", HandoffType.SUPPLY, "PRJ-001", "补素材")
    dispatch(task)
    accept(task, "operator")

    submit(task, {"asset_file": "s3://bucket/logo.png"}, "operator")
    assert task.state == HandoffState.RETURNED

    # 重复提交相同内容
    submit(task, {"asset_file": "s3://bucket/logo.png"}, "operator")
    assert task.state == HandoffState.RETURNED  # 状态不变
    assert len(task.idempotency_keys) == 1  # 只有一个幂等键


def test_illegal_transition():
    """测试非法迁移抛出 ValueError。"""
    task = create_task("TEST-004", HandoffType.REVIEW, "PRJ-001", "审核任务")

    # CREATED 直接 VALIDATED 是非法的
    with pytest.raises(ValueError, match="illegal transition"):
        validate(task, lambda t: (True, "ok"))

    # 正确路径
    dispatch(task)
    accept(task, "reviewer")
    submit(task, {"approved": True}, "reviewer")
    validate(task, lambda t: (True, "ok"))
    assert task.state == HandoffState.VALIDATED


def test_red_line_timeout():
    """测试红线任务超时不允许自动降级通过。"""
    task = create_task("TEST-005", HandoffType.FINAL_APPROVE, "PRJ-001", "发布终审")

    # 手动设置过期时间
    task.sla_deadline = (datetime.now() - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")

    result = check_timeout(task)
    assert result == "expired"
    assert task.state == HandoffState.EXPIRED
    assert can_auto_downgrade(task) is False  # 红线任务不可自动降级


def test_non_red_line_timeout_allows_downgrade():
    """测试非红线任务超时允许降级。"""
    task = create_task("TEST-006", HandoffType.SUPPLY, "PRJ-001", "补素材")
    task.sla_deadline = (datetime.now() - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")

    result = check_timeout(task)
    assert result == "expired"
    assert task.state == HandoffState.EXPIRED
    assert can_auto_downgrade(task) is True  # 非红线可降级


def test_reminder_firing():
    """测试催办触发。"""
    task = create_task("TEST-007", HandoffType.SHOOT, "PRJ-001", "拍摄")
    # 设置为 SLA 剩余 20%（48h * 0.25 = 12h），触发催办
    task.sla_deadline = (datetime.now() + timedelta(hours=10)).strftime("%Y-%m-%d %H:%M:%S")

    result = check_timeout(task)
    assert result == "remind"
    assert task.reminders == 1


def test_validate_transition():
    """测试状态迁移验证。"""
    assert validate_transition(HandoffState.CREATED, HandoffState.DISPATCHED) is True
    assert validate_transition(HandoffState.CREATED, HandoffState.VALIDATED) is False
    assert validate_transition(HandoffState.RETURNED, HandoffState.VALIDATED) is True
    assert validate_transition(HandoffState.RETURNED, HandoffState.DISPATCHED) is False
    assert validate_transition(HandoffState.REJECTED, HandoffState.DISPATCHED) is True


def test_handoff_bus_integration():
    """测试 HandoffBus 门面集成。"""
    bus = HandoffBus()

    task = bus.create("BUS-001", HandoffType.AUTHORIZE, "PRJ-001", "授权任务")
    assert bus.get("BUS-001") is task

    bus.dispatch("BUS-001", "admin")
    assert task.state == HandoffState.DISPATCHED

    bus.accept("BUS-001", "operator")
    assert task.state == HandoffState.IN_PROGRESS

    bus.submit("BUS-001", {"signed_release": "s3://bucket/release.pdf"}, "operator")
    assert task.state == HandoffState.RETURNED

    def validator(t):
        return "signed_release" in t.payload, "missing signed_release"

    bus.validate("BUS-001", validator, "system")
    assert task.state == HandoffState.VALIDATED

    resumed = []

    def downstream(t):
        resumed.append(True)

    bus.resume("BUS-001", downstream)
    assert task.state == HandoffState.RESUMED
    assert len(resumed) == 1


def test_audit_log():
    """测试审计日志记录。"""
    audit_log = HandoffAuditLog()

    entry = audit_log.log(
        task_id="TASK-001",
        actor="operator_1",
        action="submit",
        detail="uploaded video",
        ip="192.168.1.1",
        user_agent="Mozilla/5.0",
        payload={"video_clip": "s3://bucket/s01.mp4"},
    )

    assert entry.task_id == "TASK-001"
    assert entry.actor == "operator_1"
    assert entry.action == "submit"
    assert entry.payload_hash != ""

    entries = audit_log.get_task_audit("TASK-001")
    assert len(entries) == 1

    # 测试导出
    json_report = audit_log.export_audit_report("TASK-001", "json")
    assert "TASK-001" in json_report
    assert "operator_1" in json_report

    csv_report = audit_log.export_audit_report("TASK-001", "csv")
    assert "TASK-001" in csv_report
    assert "operator_1" in csv_report


def test_audit_retention():
    """测试审计保留清理。"""
    audit_log = HandoffAuditLog(retention_days=180)

    # 添加一个旧记录
    old_entry = audit_log.log(
        task_id="OLD-001",
        actor="system",
        action="created",
    )
    # 手动修改时间为 200 天前
    old_entry.at = (datetime.now() - timedelta(days=200)).strftime("%Y-%m-%d %H:%M:%S")

    # 添加一个新记录
    audit_log.log("NEW-001", "system", "created")

    expired = audit_log.archive_expired()
    assert len(expired) == 1
    assert expired[0].task_id == "OLD-001"

    # 清理后只剩新记录
    audit_log.cleanup_expired()
    assert len(audit_log.entries) == 1
    assert audit_log.entries[0].task_id == "NEW-001"


def test_task_timeout_check():
    """测试批量超时检查。"""
    bus = HandoffBus()

    # 正常任务
    bus.create("NORMAL-001", HandoffType.SHOOT, "PRJ-001", "正常")
    # 过期任务
    task = bus.create("EXPIRED-001", HandoffType.SUPPLY, "PRJ-001", "过期")
    task.sla_deadline = (datetime.now() - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")

    results = bus.check_timeouts()
    assert results["NORMAL-001"] == "ok"
    assert results["EXPIRED-001"] == "expired"


def test_list_tasks_filter():
    """测试任务列表筛选。"""
    bus = HandoffBus()

    bus.create("T1", HandoffType.SHOOT, "PRJ-001", "拍摄1")
    bus.create("T2", HandoffType.SHOOT, "PRJ-002", "拍摄2")
    bus.create("T3", HandoffType.AUTHORIZE, "PRJ-001", "授权1")

    # 按类型筛选
    shoot_tasks = bus.list_tasks(htype=HandoffType.SHOOT)
    assert len(shoot_tasks) == 2

    # 按项目筛选
    prj1_tasks = bus.list_tasks(project_id="PRJ-001")
    assert len(prj1_tasks) == 2

    # 按状态筛选
    created_tasks = bus.list_tasks(state=HandoffState.CREATED)
    assert len(created_tasks) == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])