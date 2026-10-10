# -*- coding: utf-8 -*-
# file: backend/export/__init__.py
# 作用：导出模块 —— PSD 二进制写入
from __future__ import annotations

from .psd import write_psd

__all__ = ["write_psd"]
