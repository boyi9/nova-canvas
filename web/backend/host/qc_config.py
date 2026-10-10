"""素材质检配置加载器。"""
from __future__ import annotations

import os
import yaml


def _load_yaml(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


_CONFIG_DIR = os.path.join(os.path.dirname(__file__), "data")
_QC_CONFIG = _load_yaml(os.path.join(_CONFIG_DIR, "qc_thresholds.yaml"))

# 导出常用配置
THRESHOLDS = _QC_CONFIG.get("thresholds", {})
SCORING = _QC_CONFIG.get("scoring", {})
VERDICT_RULES = _QC_CONFIG.get("verdict_rules", {})


def get_threshold(metric: str) -> dict:
    """获取指定指标的阈值配置。"""
    return THRESHOLDS.get(metric, {})


def get_scoring_weights() -> dict:
    """获取评分权重。"""
    return SCORING.get("weights", {})


def get_verdict_boundaries() -> dict:
    """获取三态判定边界。"""
    return {
        "pass_min": VERDICT_RULES.get("pass_min", 85),
        "warn_min": VERDICT_RULES.get("warn_min", 60),
    }