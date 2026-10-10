# -*- coding: utf-8 -*-
# file: backend/models/parsers/command_parser.py
# 作用：NC-CAP-00 I2 结构化指令解析器
from typing import Any, Dict, List, Optional


# 合法指令白名单（与七类操作对齐）
VALID_COMMANDS = {
    "create", "optimize", "adjust", "repair", "add",
    "understand", "evaluate", "export", "publish", "batch",
}

# 合法参数键（示例，可扩展）
VALID_PARAM_KEYS = {
    "operation", "target", "params", "model", "priority",
    "output_format", "resolution", "duration_s", "seed",
}


def parse_command(text: str) -> Dict[str, Any]:
    """解析结构化指令字符串 → dict；非法取值返回空 dict（由上层报错）"""
    if not text or not text.strip():
        return {}

    text = text.strip()
    result: Dict[str, Any] = {}

    # 格式1：JSON
    if text.startswith("{"):
        import json
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                return _validate(data)
        except (json.JSONDecodeError, ValueError):
            pass

    # 格式2：key=value; key2=value2
    if "=" in text:
        for pair in text.split(";"):
            pair = pair.strip()
            if "=" in pair:
                k, v = pair.split("=", 1)
                k, v = k.strip(), v.strip()
                if k:
                    result[k] = v
        if result:
            return _validate(result)

    # 格式3：纯操作名（如 "create"）
    if text.lower() in VALID_COMMANDS:
        return {"operation": text.lower()}

    return {}


def _validate(data: Dict[str, Any]) -> Dict[str, Any]:
    """校验并过滤非法键"""
    return {k: v for k, v in data.items() if k in VALID_PARAM_KEYS}


def list_valid_commands() -> List[str]:
    return sorted(VALID_COMMANDS)


def list_valid_param_keys() -> List[str]:
    return sorted(VALID_PARAM_KEYS)
