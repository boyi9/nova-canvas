# -*- coding: utf-8 -*-
# file: backend/retouch/compliance.py
# 作用：NC-RET-12 合规红线闸门 —— 商品本体 / 肖像授权 / 知识产权（代码级锁死）
from __future__ import annotations

from typing import Any, Dict, List, Tuple

from web.backend.retouch.ops import (
    BODY_ALTERING_OPS,
    IP_CLEAR_OPS,
    PORTRAIT_AUTH_OPS,
    REDLINE_OPS,
)

AUTO_FORBIDDEN_ACTIONS = {"publish", "spend", "spend_money", "account_security"}


def gate_before_execute(task: Dict[str, Any], auth: Dict[str, bool]) -> Tuple[bool, List[str]]:
    """执行前闸门。返回 (allowed, reasons)。红线不可配置、不可绕过。"""
    reasons: List[str] = []
    spec = task.get("spec") or {}
    ops = set(spec.get("ops") or [])
    target = task.get("target") or spec.get("target") or "any"

    if task.get("is_auto") and (task.get("action") in AUTO_FORBIDDEN_ACTIONS):
        reasons.append("发布/花钱/账号安全三类动作永久人工确认，禁止自动执行")
    if target == "product" and (BODY_ALTERING_OPS & ops):
        reasons.append("商品本体不得生成式改动（平台商品真实性要求）")
    if (PORTRAIT_AUTH_OPS & ops) and not auth.get("portrait_granted"):
        reasons.append("人像形变/换脸需先取得肖像授权")
    if (IP_CLEAR_OPS & ops) and not auth.get("ip_cleared"):
        reasons.append("去水印/去文字需先确认素材知识产权")
    if (REDLINE_OPS & ops) and not task.get("human_confirm"):
        reasons.append("换脸属红线动作，必须人工最终确认")
    return (len(reasons) == 0), reasons


def startup_assert_retouch_config(auto_actions: List[str]) -> None:
    """启动期断言：任何被标为“可自动执行”的红线动作，服务拒绝启动。"""
    bad = set(auto_actions or []) & (REDLINE_OPS | AUTO_FORBIDDEN_ACTIONS)
    if bad:
        raise RuntimeError(
            f"启动检查失败：红线动作被配置为可自动执行: {sorted(bad)}（服务拒绝启动）"
        )
