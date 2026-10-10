# -*- coding: utf-8 -*-
"""backend.models 包

注意：实际的模型路由实现是 model_router.py（由 generation_gateway 接线）。
旧的 router.py（MockClient 占位实现）已删除。
"""
from web.backend.models.input_spec import (
    InputType,
    InputSpec,
    resolve_input,
    I1_REQUIRED,
)
from web.backend.models.control_mode import (
    ControlMode,
    AutomationCategory,
    Operation as ControlOperation,
    ControlModeViolation,
    RED_LINE_ACTIONS,
    AUTO_ALLOWED_OPERATIONS,
    assert_control_mode,
    check_control_mode,
    category_of,
)
from web.backend.models.operations import (
    Operation,
    OPERATION_CAPS,
    SkillSpec,
    SkillRegistry,
)

__all__ = [
    # input_spec (NC-CAP-00)
    "InputType",
    "InputSpec",
    "resolve_input",
    "I1_REQUIRED",
    # control_mode (NC-CAP-01)
    "ControlMode",
    "AutomationCategory",
    "ControlOperation",
    "ControlModeViolation",
    "RED_LINE_ACTIONS",
    "AUTO_ALLOWED_OPERATIONS",
    "assert_control_mode",
    "check_control_mode",
    "category_of",
    # operations (NC-CAP-02)
    "Operation",
    "OPERATION_CAPS",
    "SkillSpec",
    "SkillRegistry",
]
