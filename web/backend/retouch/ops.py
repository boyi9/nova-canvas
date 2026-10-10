# -*- coding: utf-8 -*-
# file: backend/retouch/ops.py
# 作用：NC-RET-01 修图算子库（附录 C，21 算子）
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

SCOPE_PORTRAIT = "portrait"
SCOPE_PRODUCT = "product"
SCOPE_SCENE = "scene"
SCOPE_ANY = "any"

RISK_LOW = "low"
RISK_MEDIUM = "medium"
RISK_HIGH = "high"

REQ_PORTRAIT_AUTH = "portrait_auth"
REQ_IP_CLEAR = "ip_clear"
REQ_REDLINE = "redline"


@dataclass(frozen=True)
class RetouchOp:
    """修图算子元数据。"""

    name: str
    cn: str
    scope: str
    risk: str
    requires: tuple = ()
    engine: str = ""


def _op(name, cn, scope, risk, engine, *requires) -> RetouchOp:
    return RetouchOp(name=name, cn=cn, scope=scope, risk=risk, requires=tuple(requires), engine=engine)


OPS: Dict[str, RetouchOp] = {
    op.name: op
    for op in [
        # 人像
        _op("skin_smooth", "磨皮/肤质优化", SCOPE_PORTRAIT, RISK_LOW, "skin_frequency"),
        _op("blemish_remove", "祛痘/祛斑", SCOPE_PORTRAIT, RISK_LOW, "blemish"),
        _op("skin_tone_unify", "肤色统一", SCOPE_PORTRAIT, RISK_LOW, "tone_unify"),
        _op("eye_enhance", "眼睛增强", SCOPE_PORTRAIT, RISK_LOW, "local_color"),
        _op("teeth_whiten", "牙齿美白", SCOPE_PORTRAIT, RISK_LOW, "local_color"),
        _op("face_reshape", "脸型/五官调整", SCOPE_PORTRAIT, RISK_MEDIUM, "liquify", REQ_PORTRAIT_AUTH),
        _op("body_reshape", "全身美型", SCOPE_PORTRAIT, RISK_MEDIUM, "liquify", REQ_PORTRAIT_AUTH),
        _op("makeup", "妆容调整", SCOPE_PORTRAIT, RISK_MEDIUM, "local_makeup", REQ_PORTRAIT_AUTH),
        _op("face_swap", "换脸/换模特", SCOPE_PORTRAIT, RISK_HIGH, "generative", REQ_PORTRAIT_AUTH, REQ_REDLINE),
        # 商品
        _op("product_texture", "质感增强", SCOPE_PRODUCT, RISK_LOW, "texture"),
        _op("product_light", "光影重绘", SCOPE_PRODUCT, RISK_LOW, "ic_light"),
        _op("edge_clean", "边缘净化", SCOPE_PRODUCT, RISK_LOW, "edge"),
        _op("color_calibrate", "色彩校准", SCOPE_PRODUCT, RISK_LOW, "color"),
        _op("remove_reflection", "去反光", SCOPE_PRODUCT, RISK_LOW, "inpaint"),
        # 通用/场景
        _op("remove_watermark", "去水印/去文字", SCOPE_ANY, RISK_MEDIUM, "flux_fill", REQ_IP_CLEAR),
        _op("remove_passersby", "祛路人/祛杂物", SCOPE_ANY, RISK_LOW, "sam_inpaint"),
        _op("bg_replace", "换背景", SCOPE_ANY, RISK_LOW, "rmbg"),
        _op("sky_replace", "换天空/天气", SCOPE_SCENE, RISK_LOW, "sky"),
        _op("cloth_flatten", "衣服祛褶", SCOPE_ANY, RISK_LOW, "comfy_cloth"),
        _op("upscale", "高清放大", SCOPE_ANY, RISK_LOW, "realesrgan"),
        _op("outpaint", "扩图/补画面", SCOPE_ANY, RISK_LOW, "outpaint"),
    ]
}

OP_NAMES: List[str] = list(OPS.keys())

# 改变商品本体（NC-RET-12 红线之一）
BODY_ALTERING_OPS = frozenset({"outpaint", "face_swap"})
PORTRAIT_AUTH_OPS = frozenset({"face_reshape", "body_reshape", "makeup", "face_swap"})
IP_CLEAR_OPS = frozenset({"remove_watermark"})
REDLINE_OPS = frozenset({"face_swap"})


def get_op(name: str) -> RetouchOp:
    op = OPS.get(name)
    if op is None:
        raise KeyError(f"未知修图算子: {name}")
    return op
