# -*- coding: utf-8 -*-
# file: backend/models/parsers/prompt_resolver.py
# 作用：NC-CAP-00 I3 提示词资产库解析器
# 规则：不允许内联裸提示词进生产，必须走资产库版本
from typing import Any, Dict, Optional


# 提示词资产库（生产环境应从 DB/YAML 加载，此处为内置演示）
_PROMPT_ASSET_LIB: Dict[str, Dict[str, Any]] = {
    "ecom_main_image_v1": {
        "version": "1.0.0",
        "body": "高质感电商主图，{product}，纯白背景，居中构图，商业摄影风格",
        "model_hints": ["seedream", "flux"],
        "status": "active",
    },
    "ecom_detail_v1": {
        "version": "1.0.0",
        "body": "电商详情页模块，突出{selling_point}，场景化展示",
        "model_hints": ["seedream", "flux"],
        "status": "active",
    },
    "video_product_v1": {
        "version": "1.0.0",
        "body": "15秒产品展示短视频，{product}，缓慢旋转，柔光，背景渐变",
        "model_hints": ["seedance", "kling"],
        "status": "active",
    },
}


def resolve_prompt(ref: str) -> Dict[str, Any]:
    """
    解析提示词引用。
    - 若 ref 是资产库 key（如 "ecom_main_image_v1"）→ 返回资产
    - 若 ref 是内联裸提示词 → 返回空 dict（禁止进生产）
    """
    if not ref or not ref.strip():
        return {}

    ref = ref.strip()

    # 资产库命中
    if ref in _PROMPT_ASSET_LIB:
        asset = _PROMPT_ASSET_LIB[ref]
        if asset.get("status") != "active":
            return {}
        return {
            "source": "asset_lib",
            "key": ref,
            "version": asset["version"],
            "body": asset["body"],
            "model_hints": asset.get("model_hints", []),
        }

    # 内联裸提示词 → 拒绝
    return {}


def register_prompt_asset(key: str, body: str, version: str = "1.0.0",
                          model_hints: Optional[list] = None) -> None:
    """注册新提示词资产（开发/测试用）"""
    _PROMPT_ASSET_LIB[key] = {
        "version": version,
        "body": body,
        "model_hints": model_hints or [],
        "status": "active",
    }


def list_prompt_assets() -> Dict[str, Dict[str, Any]]:
    return dict(_PROMPT_ASSET_LIB)
