# -*- coding: utf-8 -*-
# file: backend/retouch/orchestrator.py
# 作用：NC-RET-08 多算子固定执行序（避免顺序错误导致返工）
from __future__ import annotations

from typing import Dict, List

# 执行序（rank 越小越先执行）——与方案第 29 章一致：
# 1 形变 → 2 肤色统一 → 3 磨皮 → 4 祛痘 → 5 五官/妆容/牙/眼
# → 6 商品本体 → 7 场景 → 8 去水印/去路人 → 9 高清放大（收尾）
_OP_RANK: Dict[str, int] = {
    "face_swap": 10,
    "face_reshape": 11,
    "body_reshape": 12,
    "skin_tone_unify": 20,
    "skin_smooth": 30,
    "blemish_remove": 40,
    "eye_enhance": 50,
    "teeth_whiten": 51,
    "makeup": 52,
    "product_texture": 60,
    "product_light": 61,
    "edge_clean": 62,
    "color_calibrate": 63,
    "remove_reflection": 64,
    "bg_replace": 70,
    "sky_replace": 71,
    "cloth_flatten": 72,
    "outpaint": 73,
    "remove_watermark": 80,
    "remove_passersby": 81,
    "upscale": 99,
}

_DEFAULT_RANK = 90


def op_rank(op: str) -> int:
    return _OP_RANK.get(op, _DEFAULT_RANK)


def order_ops(ops: List[str]) -> List[str]:
    """按固定执行序排序（稳定：同 rank 保持输入顺序）。"""
    seen = []
    for op in ops:
        if op not in seen:
            seen.append(op)
    return sorted(seen, key=op_rank)


def execution_plan(ops: List[str]) -> List[Dict]:
    """带步骤号的执行计划（用户可手动覆盖并记录）。"""
    ordered = order_ops(ops)
    return [{"step": i + 1, "op": op, "rank": op_rank(op)} for i, op in enumerate(ordered)]
