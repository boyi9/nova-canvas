# -*- coding: utf-8 -*-
# file: tests/test_cap_catalog.py
# 作用：NC-CAP-03 机器可读模型能力目录测试
import os
import pytest
from web.backend.models.catalog import (
    ModelCatalog,
    ModelEntry,
    CatalogError,
    load_catalog,
    get_catalog,
    reset_catalog,
)


class TestCatalogLoading:
    """目录加载与校验"""

    def test_load_default_catalog(self):
        """加载默认目录成功"""
        catalog = load_catalog()
        assert len(catalog.all()) > 0

    def test_summary(self):
        """摘要包含模型数与能力覆盖"""
        catalog = load_catalog()
        s = catalog.summary()
        assert s["total_models"] > 0
        assert "capability_coverage" in s
        assert "image_gen" in s["capability_coverage"]

    def test_empty_file_raises(self):
        """空目录 → CatalogError（不允许空目录裸跑）"""
        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write("models: []")
            tmp = f.name
        try:
            with pytest.raises(CatalogError):
                load_catalog(tmp)
        finally:
            os.unlink(tmp)

    def test_missing_file_raises(self):
        """文件不存在 → CatalogError"""
        with pytest.raises(CatalogError):
            load_catalog("/nonexistent/path.yaml")

    def test_invalid_yaml_raises(self):
        """非法 YAML → CatalogError"""
        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write("models: [invalid")
            tmp = f.name
        try:
            with pytest.raises(CatalogError):
                load_catalog(tmp)
        finally:
            os.unlink(tmp)

    def test_missing_capabilities_raises(self):
        """缺 capabilities → CatalogError"""
        import tempfile
        content = """
models:
  - alias: bad
    model: test/v1
    regions: [cn]
    license: commercial
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(content)
            tmp = f.name
        try:
            with pytest.raises(CatalogError) as exc:
                load_catalog(tmp)
            assert "capabilities" in str(exc.value)
        finally:
            os.unlink(tmp)

    def test_missing_regions_raises(self):
        """缺 regions → CatalogError"""
        import tempfile
        content = """
models:
  - alias: bad
    model: test/v1
    capabilities: [image_gen]
    license: commercial
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(content)
            tmp = f.name
        try:
            with pytest.raises(CatalogError) as exc:
                load_catalog(tmp)
            assert "regions" in str(exc.value)
        finally:
            os.unlink(tmp)


class TestLicenseFiltering:
    """license 合规过滤"""

    def test_production_candidates_only_commercial(self):
        """生产候选集只含 license_ok 的模型"""
        catalog = load_catalog()
        for e in catalog.production_candidates():
            assert e.license_ok

    def test_openrail_not_in_production(self):
        """openrail 模型未显式允许时不进生产候选集"""
        # 构造一个不允许的 openrail 模型
        entry = ModelEntry(
            alias="test",
            model="test/v1",
            capabilities=["inpaint"],
            regions=["cn"],
            license="openrail-plus-plus",
            allow_noncommercial=False,
        )
        assert not entry.license_ok

    def test_openrail_with_allow_flag(self):
        """openrail 模型显式允许后可进候选集"""
        entry = ModelEntry(
            alias="test",
            model="test/v1",
            capabilities=["inpaint"],
            regions=["cn"],
            license="openrail-plus-plus",
            allow_noncommercial=True,
        )
        assert entry.license_ok


class TestCatalogQueries:
    """目录查询"""

    def test_get_by_alias(self):
        catalog = load_catalog()
        e = catalog.get("image-edit-primary")
        assert e.model == "doubao/seedream-5.0-pro"

    def test_get_missing_alias(self):
        catalog = load_catalog()
        with pytest.raises(KeyError):
            catalog.get("nonexistent")

    def test_by_capability(self):
        catalog = load_catalog()
        inpaint_models = catalog.by_capability("inpaint")
        assert len(inpaint_models) >= 1
        for e in inpaint_models:
            assert "inpaint" in e.capabilities
