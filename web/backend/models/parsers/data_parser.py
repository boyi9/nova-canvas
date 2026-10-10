# -*- coding: utf-8 -*-
# file: backend/models/parsers/data_parser.py
# 作用：NC-CAP-00 I4 数据输入解析器（指标/日志/素材/反馈/规则）
from typing import Any, Dict, List, Tuple


# I4 五条数据通道
DATA_CHANNELS = {"metric", "feedback", "asset", "rule", "benchmark"}

# 各通道必填字段
_CHANNEL_REQUIRED = {
    "metric": ["name", "value", "baseline"],
    "feedback": ["source", "content"],
    "asset": ["asset_id", "type"],
    "rule": ["rule_id", "content"],
    "benchmark": ["account_id", "platform"],
}


def parse_data(raw: Any) -> Tuple[Dict[str, Any], List[str]]:
    """
    解析数据输入 → (normalized, missing)
    - raw 为 dict 时直接校验
    - raw 为 str 时尝试 JSON 解析
    - 无阈值依据（baseline）时不触发（返回 missing）
    """
    data: Dict[str, Any] = {}

    if isinstance(raw, dict):
        data = dict(raw)
    elif isinstance(raw, str):
        import json
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                data = parsed
        except (json.JSONDecodeError, ValueError):
            return {}, ["invalid_json"]

    if not data:
        return {}, ["empty_data"]

    # 确定通道
    channel = data.get("channel", "")
    if channel not in DATA_CHANNELS:
        # 尝试自动推断
        channel = _infer_channel(data)
        if channel:
            data["channel"] = channel

    missing: List[str] = []

    if not channel:
        missing.append("channel")
        return data, missing

    # 校验通道必填字段
    required = _CHANNEL_REQUIRED.get(channel, [])
    for key in required:
        if key not in data or data[key] in (None, ""):
            missing.append(key)

    # metric 通道额外校验：无 baseline 不触发
    if channel == "metric" and "baseline" in data and data.get("baseline") is None:
        if "baseline" not in missing:
            missing.append("baseline")

    return data, missing


def _infer_channel(data: Dict[str, Any]) -> str:
    """根据字段自动推断数据通道"""
    if "metric" in data or ("name" in data and "value" in data and "baseline" in data):
        return "metric"
    if "feedback" in data or ("source" in data and "content" in data):
        return "feedback"
    if "asset" in data or ("asset_id" in data and "type" in data):
        return "asset"
    if "rule" in data or ("rule_id" in data and "content" in data):
        return "rule"
    if "benchmark" in data or ("account_id" in data and "platform" in data):
        return "benchmark"
    return ""
