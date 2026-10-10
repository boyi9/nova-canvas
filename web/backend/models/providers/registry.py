# -*- coding: utf-8 -*-
# file: backend/models/providers/registry.py
# 作用：模型别名/模型名 → 供应商适配器注册表
from typing import Any, Dict, Optional, Type

from .base import ProviderAdapter, ProviderError
from .volcengine_provider import VolcengineProvider
from .aliyun_provider import AliyunProvider
from .kling_provider import KlingProvider
from .amazon_provider import AmazonProvider

# 模型前缀 → 供应商类
_MODEL_PREFIX_MAP: Dict[str, Type[ProviderAdapter]] = {
    "doubao/": VolcengineProvider,
    "volcengine/": VolcengineProvider,
    "aliyun/": AliyunProvider,
    "dashscope/": AliyunProvider,
    "kuaishou/": KlingProvider,
    "kling/": KlingProvider,
    "amazon/": AmazonProvider,
    "bedrock/": AmazonProvider,
    "nova-canvas": AmazonProvider,
}

# 模型目录中的 alias → 供应商类（兜底）
_ALIAS_MAP: Dict[str, Type[ProviderAdapter]] = {
    "image-edit-primary": VolcengineProvider,
    "image-edit-fallback": AliyunProvider,
    "video-gen-primary": VolcengineProvider,
    "video-edit-audio-sync": KlingProvider,
    "llm-orchestrator": AliyunProvider,
    "batch-fission-budget": VolcengineProvider,
    "brand-keyvisual-premium": AmazonProvider,
    "overseas-video": VolcengineProvider,
}

_provider_instances: Dict[str, ProviderAdapter] = {}


def provider_for_model(model: str, alias: Optional[str] = None) -> ProviderAdapter:
    """按模型名/别名解析供应商实例（带缓存）"""
    cls: Optional[Type[ProviderAdapter]] = None
    if model:
        for prefix, c in _MODEL_PREFIX_MAP.items():
            if model.startswith(prefix) or prefix in model:
                cls = c
                break
    if cls is None and alias:
        cls = _ALIAS_MAP.get(alias)
    if cls is None:
        raise ProviderError(f"无法为模型 '{model}' (alias={alias}) 解析供应商，请检查 models_catalog.yaml")

    key = cls.provider_key
    if key not in _provider_instances:
        _provider_instances[key] = cls()
    return _provider_instances[key]


def all_providers() -> Dict[str, ProviderAdapter]:
    """全部供应商实例（用于健康检查）"""
    for cls in (VolcengineProvider, AliyunProvider, KlingProvider, AmazonProvider):
        if cls.provider_key not in _provider_instances:
            _provider_instances[cls.provider_key] = cls()
    return dict(_provider_instances)


def health_report() -> Dict[str, Any]:
    return {k: v.health() for k, v in all_providers().items()}


def reset_providers() -> None:
    """重置实例缓存（测试用）"""
    _provider_instances.clear()
