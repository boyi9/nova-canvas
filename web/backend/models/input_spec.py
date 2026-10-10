# -*- coding: utf-8 -*-
# file: backend/models/input_spec.py
# 作用：NC-CAP-00 四类输入谱系统一解析接口
from enum import Enum
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


class InputType(str, Enum):
    I1_DEMAND = "I1"   # 需求：模糊目标
    I2_COMMAND = "I2"  # 指令：结构化命令
    I3_PROMPT = "I3"   # 提示词：模型级描述
    I4_DATA = "I4"     # 数据：指标/日志/素材/反馈/规则


# I1 必须补齐的关键参数（缺一即追问，禁止编造）
I1_REQUIRED = ["product_name", "core_selling_point", "target_platform"]


@dataclass
class InputSpec:
    """统一输入规格对象：四类输入解析后均落为本对象"""
    type: InputType
    raw: Any
    normalized: Dict[str, Any] = field(default_factory=dict)
    missing: List[str] = field(default_factory=list)
    source_ref: Optional[str] = None  # I4 的数据快照引用

    @property
    def ready(self) -> bool:
        """是否已补全，未补全不得进入执行"""
        return not self.missing


def resolve_input(type_: InputType, raw: Any) -> InputSpec:
    """统一入口：解析后返回 InputSpec，未补全者不得进入执行。"""
    if type_ is InputType.I1_DEMAND:
        return _resolve_demand(raw)
    if type_ is InputType.I2_COMMAND:
        from web.backend.models.parsers.command_parser import parse_command
        normalized = parse_command(str(raw))
        missing = [] if normalized else ["command_parse_failed"]
        return InputSpec(type_, raw, normalized, missing)
    if type_ is InputType.I3_PROMPT:
        from web.backend.models.parsers.prompt_resolver import resolve_prompt
        normalized = resolve_prompt(str(raw))
        missing = [] if normalized else ["prompt_not_in_asset_lib"]
        return InputSpec(type_, raw, normalized, missing)
    if type_ is InputType.I4_DATA:
        from web.backend.models.parsers.data_parser import parse_data
        normalized, missing = parse_data(raw)
        return InputSpec(type_, raw, normalized, missing, source_ref=str(raw))
    raise ValueError(f"未知输入类型 {type_}")


def _resolve_demand(raw: Any) -> InputSpec:
    """I1 需求解析：从自然语言或 dict 中提取关键字段，缺一即追问"""
    normalized: Dict[str, Any] = {}
    if isinstance(raw, dict):
        normalized = {k: raw[k] for k in I1_REQUIRED if k in raw}
        if "intent" in raw:
            normalized["intent"] = raw["intent"]
    elif isinstance(raw, str):
        normalized = {"intent": raw}
        # 简单关键词启发式提取（生产环境应换 LLM 结构化抽取）
        _try_extract_fields(raw, normalized)
    missing = [k for k in I1_REQUIRED if k not in normalized or not normalized[k]]
    return InputSpec(InputType.I1_DEMAND, raw, normalized, missing)


def _try_extract_fields(text: str, out: Dict[str, Any]) -> None:
    """从自然语言中启发式提取字段（仅演示，正式版接 LLM）"""
    import re
    # 商品名："关于XXX""帮我做XXX"模式
    m = re.search(r"(?:关于|帮我做|帮我生成|做一个|制作)([\u4e00-\u9fa5A-Za-z0-9]+)", text)
    if m and "product_name" not in out:
        out["product_name"] = m.group(1)
    # 卖点：含"卖点""亮点""特色"
    m = re.search(r"(?:卖点|亮点|特色)[是为:：]?\s*([\u4e00-\u9fa5A-Za-z0-9，,]+)", text)
    if m and "core_selling_point" not in out:
        out["core_selling_point"] = m.group(1).strip()
    # 平台：关键词匹配
    for plat in ("抖音", "淘宝", "拼多多", "小红书", "京东", "快手", "视频号"):
        if plat in text and "target_platform" not in out:
            out["target_platform"] = plat
            break
