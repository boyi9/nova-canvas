# -*- coding: utf-8 -*-
# file: backend/retouch/intent.py
# 作用：NC-RET-01 自然语言修图指令解析器 + 三道闸门（附录用例 7 条为验收基准）
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from web.backend.retouch.ops import (
    BODY_ALTERING_OPS,
    IP_CLEAR_OPS,
    PORTRAIT_AUTH_OPS,
    REDLINE_OPS,
)

# ---- 关键词 → 算子（先匹配先得，按特异性排序）----
_KEYWORD_OP: List[Tuple[str, str]] = [
    # 人像
    ("磨皮", "skin_smooth"),
    ("肤质", "skin_smooth"),
    ("美颜", "skin_smooth"),
    ("祛痘", "blemish_remove"),
    ("祛斑", "blemish_remove"),
    ("痘痘", "blemish_remove"),
    ("痘印", "blemish_remove"),
    ("痣", "blemish_remove"),
    ("统一肤色", "skin_tone_unify"),
    ("肤色", "skin_tone_unify"),
    ("肤色不均", "skin_tone_unify"),
    ("大眼", "eye_enhance"),
    ("眼睛", "eye_enhance"),
    ("美瞳", "eye_enhance"),
    ("牙齿", "teeth_whiten"),
    ("牙黄", "teeth_whiten"),
    ("美白牙", "teeth_whiten"),
    ("瘦个脸", "face_reshape"),
    ("瘦脸", "face_reshape"),
    ("脸型", "face_reshape"),
    ("下颌线", "face_reshape"),
    ("小脸", "face_reshape"),
    ("瘦身", "body_reshape"),
    ("美型", "body_reshape"),
    ("全身", "body_reshape"),
    ("减肥", "body_reshape"),
    ("妆容", "makeup"),
    ("口红", "makeup"),
    ("腮红", "makeup"),
    ("换脸", "face_swap"),
    ("换成另一个模特", "face_swap"),
    ("换模特", "face_swap"),
    ("换个人", "face_swap"),
    # 商品
    ("金属质感", "product_texture"),
    ("质感", "product_texture"),
    ("纹理增强", "product_texture"),
    ("打光", "product_light"),
    ("布光", "product_light"),
    ("光影", "product_light"),
    ("补光", "product_light"),
    ("白边", "edge_clean"),
    ("毛边", "edge_clean"),
    ("边缘", "edge_clean"),
    ("色卡", "color_calibrate"),
    ("色彩校准", "color_calibrate"),
    ("偏色", "color_calibrate"),
    ("反光", "remove_reflection"),
    ("倒影", "remove_reflection"),
    # 通用
    ("水印", "remove_watermark"),
    ("去文字", "remove_watermark"),
    ("路人", "remove_passersby"),
    ("杂物", "remove_passersby"),
    ("换背景", "bg_replace"),
    ("白底", "bg_replace"),
    ("纯色底", "bg_replace"),
    ("换天空", "sky_replace"),
    ("换天气", "sky_replace"),
    ("祛褶", "cloth_flatten"),
    ("去褶", "cloth_flatten"),
    ("皱", "cloth_flatten"),
    ("高清放大", "upscale"),
    ("放大到", "upscale"),
    ("超分", "upscale"),
    ("4k", "upscale"),
    ("扩图", "outpaint"),
    ("补画面", "outpaint"),
    ("补全画面", "outpaint"),
]

# 背景类用正则兜底（“换成风景背景”等含“背景”的表述）
_BG_PATTERNS = [
    re.compile(r"换.{0,6}背景"),
    re.compile(r"背景.{0,4}换"),
    re.compile(r"背景.{0,4}(白|纯色|风景|渐变)"),
]

# 打光类正则兜底（“帮我打个光”等）
_LIGHT_PATTERNS = [
    re.compile(r"打.{0,3}光"),
    re.compile(r"布.{0,2}光"),
]

# 扩图类正则兜底（“扩一下图”等）
_OUTPAINT_PATTERNS = [
    re.compile(r"扩.{0,3}图"),
]

# 强度词表：词 → (默认强度, 风格标记)
_STRENGTH_RULES: List[Tuple[str, float]] = [
    ("自然一点", 0.5),
    ("自然些", 0.5),
    ("自然", 0.5),
    ("轻一点", 0.35),
    ("轻一些", 0.35),
    ("淡一点", 0.35),
    ("保守一点", 0.35),
    ("强一点", 0.8),
    ("重一点", 0.8),
    ("加强", 0.8),
    ("明显一点", 0.8),
    ("用力", 0.8),
]

# 局部/框选词（L3）
_LOCAL_PATTERNS = [
    "局部", "框选", "只改", "只把", "只修", "只动", "这块", "这块区域",
    "左上角", "右上角", "左下角", "右下角", "中间", "区域", "涂抹", "选中",
]

# 目标推断
_PRODUCT_WORDS = ["商品", "产品", "sku", "SKU", "宝贝", "主图", "详情图", "电商图", "物件"]
_PORTRAIT_WORDS = ["人像", "人脸", "模特", "痘", "肤", "妆", "牙", "眼", "脸", "瘦", "身材", "口播"]
_SCENE_WORDS = ["天空", "天气", "背景", "风景", "扩图", "画面", "场景"]

_DEFAULT_STRENGTH = 0.5
_NO_OPS_QUESTION = "未识别到修图意图，请说明想要的效果（如：磨皮、换白底、去水印、高清放大）"


@dataclass
class RetouchSpec:
    """结构化修图意图。"""

    ops: List[str] = field(default_factory=list)
    strength: float = _DEFAULT_STRENGTH
    level: str = ""            # L1/L2/L3/L4
    target: str = "any"        # portrait/product/scene/any
    region: Optional[Dict[str, Any]] = None
    questions: List[str] = field(default_factory=list)
    redlines: List[str] = field(default_factory=list)
    allowed: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ops": self.ops,
            "strength": self.strength,
            "level": self.level,
            "target": self.target,
            "region": self.region,
            "questions": self.questions,
            "redlines": self.redlines,
            "allowed": self.allowed,
        }


def _detect_ops(text: str) -> List[str]:
    """按出现顺序去重识别算子。"""
    lowered = text.lower()
    hits: List[Tuple[int, str]] = []
    for keyword, op in _KEYWORD_OP:
        idx = lowered.find(keyword.lower())
        if idx >= 0:
            hits.append((idx, op))
    for pat in _BG_PATTERNS:
        m = pat.search(text)
        if m:
            hits.append((m.start(), "bg_replace"))
    for pat in _LIGHT_PATTERNS:
        m = pat.search(text)
        if m:
            hits.append((m.start(), "product_light"))
    for pat in _OUTPAINT_PATTERNS:
        m = pat.search(text)
        if m:
            hits.append((m.start(), "outpaint"))
    hits.sort(key=lambda x: x[0])
    seen: List[str] = []
    for _, op in hits:
        if op not in seen:
            seen.append(op)
    return seen


def _detect_strength(text: str) -> Optional[float]:
    for keyword, value in _STRENGTH_RULES:
        if keyword in text:
            return value
    return None


def _detect_target(text: str, ops: List[str]) -> str:
    product = any(w in text for w in _PRODUCT_WORDS)
    portrait = any(w in text for w in _PORTRAIT_WORDS)
    scene = any(w in text for w in _SCENE_WORDS)
    if product and not portrait:
        return "product"
    if portrait and not product:
        return "portrait"
    if scene and not portrait and not product:
        return "scene"
    # 由算子反推
    if any(o in ("skin_smooth", "blemish_remove", "skin_tone_unify", "face_reshape", "body_reshape", "makeup", "eye_enhance", "teeth_whiten", "face_swap") for o in ops):
        return "portrait"
    if any(o in ("product_texture", "product_light", "edge_clean", "color_calibrate", "remove_reflection") for o in ops):
        return "product"
    if any(o in ("sky_replace", "outpaint") for o in ops):
        return "scene"
    return "any"


def _detect_level(text: str, ops: List[str], strength: Optional[float], has_local: bool) -> str:
    if not ops:
        return ""
    if len(ops) >= 3:
        return "L4"
    if has_local:
        return "L3"
    if strength is not None or len(ops) >= 2:
        return "L2" if len(ops) < 3 else "L4"
    return "L1"


def check_redlines(
    target: str,
    ops: List[str],
    auth: Optional[Dict[str, bool]] = None,
) -> Tuple[bool, List[str]]:
    """三道闸门：商品本体 / 肖像授权 / 知识产权。红线不可配置、不可绕过。"""
    auth = auth or {}
    opset = set(ops)
    reasons: List[str] = []

    if target == "product" and (BODY_ALTERING_OPS & opset):
        reasons.append("商品本体不得生成式改动（平台商品真实性要求）")
    if (PORTRAIT_AUTH_OPS & opset) and not auth.get("portrait_granted"):
        missing = sorted(PORTRAIT_AUTH_OPS & opset)
        reasons.append(f"人像形变/换脸需先取得肖像授权: {missing}")
    if (IP_CLEAR_OPS & opset) and not auth.get("ip_cleared"):
        reasons.append("去水印/去文字需先确认素材知识产权")
    if (REDLINE_OPS & opset):
        reasons.append("换脸属红线动作，必须人工最终确认，禁止自动执行")
    return (len(reasons) == 0), reasons


def parse_retouch_intent(
    text: str,
    target: str = "auto",
    auth: Optional[Dict[str, bool]] = None,
) -> RetouchSpec:
    """把大白话解析为 RetouchSpec（不猜测：无算子时追问）。"""
    text = (text or "").strip()
    ops = _detect_ops(text)
    strength_hit = _detect_strength(text)
    has_local = any(w in text for w in _LOCAL_PATTERNS)

    if not ops:
        return RetouchSpec(ops=[], questions=[_NO_OPS_QUESTION], allowed=False)

    spec_target = target if target in ("portrait", "product", "scene", "any") else _detect_target(text, ops)
    level = _detect_level(text, ops, strength_hit, has_local)
    strength = strength_hit if strength_hit is not None else _DEFAULT_STRENGTH

    allowed, redlines = check_redlines(spec_target, ops, auth)

    region = None
    if has_local and level == "L3":
        region = {"mode": "local", "note": "用户指定局部区域，执行时以画布选区为准"}

    return RetouchSpec(
        ops=ops,
        strength=strength,
        level=level,
        target=spec_target,
        region=region,
        redlines=redlines,
        allowed=allowed,
    )
