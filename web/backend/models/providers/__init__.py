# -*- coding: utf-8 -*-
# file: backend/models/providers/__init__.py
# 作用：供应商适配层导出
from .base import (
    GenerationRequest,
    GenerationResult,
    ProviderAdapter,
    ProviderError,
    ProviderNotConfiguredError,
)
from .registry import (
    all_providers,
    health_report,
    provider_for_model,
    reset_providers,
)

__all__ = [
    "GenerationRequest",
    "GenerationResult",
    "ProviderAdapter",
    "ProviderError",
    "ProviderNotConfiguredError",
    "all_providers",
    "health_report",
    "provider_for_model",
    "reset_providers",
]
