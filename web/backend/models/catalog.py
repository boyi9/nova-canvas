# -*- coding: utf-8 -*-
# file: backend/models/catalog.py
# 作用：NC-CAP-03 机器可读模型能力目录加载器 + 校验器
import os
import yaml
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any


class CatalogError(Exception):
    """目录加载/校验失败"""
    pass


@dataclass
class ModelEntry:
    """单个模型能力条目"""
    alias: str
    model: str
    capabilities: List[str]
    regions: List[str]
    license: str
    risk_level: str = "low"
    max_resolution: Optional[List[int]] = None
    max_duration_s: Optional[float] = None
    context_window: Optional[int] = None
    unit_cost_cny: float = 0.0
    max_latency_s: float = 60.0
    quality: float = 0.8
    availability: float = 0.95
    requires_attribution: bool = False
    allow_noncommercial: bool = False

    @property
    def license_ok(self) -> bool:
        """是否允许进入生产链路"""
        if self.license == "commercial":
            return True
        return self.allow_noncommercial


class ModelCatalog:
    """模型能力目录：路由的唯一事实来源"""

    def __init__(self, entries: Optional[List[ModelEntry]] = None):
        self._entries: Dict[str, ModelEntry] = {}
        for e in entries or []:
            self._entries[e.alias] = e

    def get(self, alias: str) -> ModelEntry:
        if alias not in self._entries:
            raise KeyError(f"模型别名 '{alias}' 不在目录中")
        return self._entries[alias]

    def all(self) -> Dict[str, ModelEntry]:
        return dict(self._entries)

    def production_candidates(self) -> List[ModelEntry]:
        """生产候选集：license 合规的模型"""
        return [e for e in self._entries.values() if e.license_ok]

    def by_capability(self, cap: str) -> List[ModelEntry]:
        return [e for e in self._entries.values() if cap in e.capabilities]

    def summary(self) -> Dict[str, Any]:
        """启动期摘要"""
        cap_count: Dict[str, int] = {}
        for e in self._entries.values():
            for c in e.capabilities:
                cap_count[c] = cap_count.get(c, 0) + 1
        return {
            "total_models": len(self._entries),
            "production_ok": len(self.production_candidates()),
            "capability_coverage": cap_count,
        }


def load_catalog(path: Optional[str] = None) -> ModelCatalog:
    """
    加载并校验目录。
    - 目录为空/加载失败 → CatalogError（服务启动失败，不允许空目录裸跑）
    - 任一模型缺 capabilities/regions → CatalogError
    - license != commercial 且未显式允许 → 仍加载但 license_ok=False
    """
    if path is None:
        # 默认路径：项目根目录 config/models_catalog.yaml
        base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        path = os.path.join(base, "config", "models_catalog.yaml")

    if not os.path.exists(path):
        raise CatalogError(f"模型目录文件不存在: {path}")

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        raise CatalogError(f"模型目录 YAML 解析失败: {e}")

    if not data or "models" not in data or not data["models"]:
        raise CatalogError("模型目录为空，不允许空目录裸跑")

    entries: List[ModelEntry] = []
    errors: List[str] = []

    for i, raw in enumerate(data["models"]):
        alias = raw.get("alias", f"#{i}")
        # 必填校验
        if not raw.get("capabilities"):
            errors.append(f"模型 '{alias}' 缺少 capabilities")
            continue
        if not raw.get("regions"):
            errors.append(f"模型 '{alias}' 缺少 regions")
            continue
        if not raw.get("license"):
            errors.append(f"模型 '{alias}' 缺少 license")
            continue
        if not raw.get("model"):
            errors.append(f"模型 '{alias}' 缺少 model")
            continue

        entry = ModelEntry(
            alias=alias,
            model=raw["model"],
            capabilities=list(raw["capabilities"]),
            regions=list(raw["regions"]),
            license=raw["license"],
            risk_level=raw.get("risk_level", "low"),
            max_resolution=raw.get("max_resolution"),
            max_duration_s=raw.get("max_duration_s"),
            context_window=raw.get("context_window"),
            unit_cost_cny=float(raw.get("unit_cost_cny", 0.0)),
            max_latency_s=float(raw.get("max_latency_s", 60.0)),
            quality=float(raw.get("quality", 0.8)),
            availability=float(raw.get("availability", 0.95)),
            requires_attribution=bool(raw.get("requires_attribution", False)),
            allow_noncommercial=bool(raw.get("allow_noncommercial", False)),
        )
        entries.append(entry)

    if errors:
        raise CatalogError("模型目录校验失败: " + "; ".join(errors))

    if not entries:
        raise CatalogError("模型目录解析后为空")

    return ModelCatalog(entries)


# 模块级单例（首次加载）
_catalog: Optional[ModelCatalog] = None


def get_catalog() -> ModelCatalog:
    """获取全局目录单例"""
    global _catalog
    if _catalog is None:
        _catalog = load_catalog()
    return _catalog


def reset_catalog() -> None:
    """重置单例（测试用）"""
    global _catalog
    _catalog = None
