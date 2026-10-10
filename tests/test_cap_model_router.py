# -*- coding: utf-8 -*-
# file: tests/test_cap_model_router.py
# 作用：NC-CAP-04 两步路由：硬约束过滤 + 软评分测试
import pytest
from web.backend.models.catalog import load_catalog
from web.backend.models.model_router import (
    RouteRequest,
    RouteResult,
    ScoredModel,
    NoCandidateError,
    hard_filter,
    score_model,
    route,
    TASK_WEIGHTS,
    DEFAULT_WEIGHTS,
)


@pytest.fixture(scope="module")
def catalog():
    return load_catalog()


class TestHardFilter:
    """硬约束过滤"""

    def test_inpaint_and_layer_split(self):
        """需 inpaint+layer_split 时，仅同时具备两能力的模型通过"""
        catalog = load_catalog()
        req = RouteRequest(
            required_capabilities=["inpaint", "layer_split"],
            user_region="cn",
        )
        passed = hard_filter(catalog, req)
        for e in passed:
            assert "inpaint" in e.capabilities
            assert "layer_split" in e.capabilities
        # 至少有一个（image-edit-primary 有这两个能力）
        assert len(passed) >= 1

    def test_region_filter(self):
        """非 cn region 模型对境内用户被淘汰"""
        catalog = load_catalog()
        req = RouteRequest(
            required_capabilities=["video_gen"],
            user_region="cn",
        )
        passed = hard_filter(catalog, req)
        for e in passed:
            assert "cn" in e.regions

    def test_us_only_model_rejected_for_cn(self):
        """境外模型对境内用户被淘汰"""
        catalog = load_catalog()
        req = RouteRequest(
            required_capabilities=["video_gen"],
            user_region="cn",
        )
        passed = hard_filter(catalog, req)
        aliases = {e.alias for e in passed}
        assert "overseas-video" not in aliases  # overseas-video regions=[us,eu]

    def test_resolution_filter(self):
        """目标分辨率超限的模型被淘汰"""
        catalog = load_catalog()
        req = RouteRequest(
            required_capabilities=["image_gen"],
            user_region="cn",
            target_resolution=(3000, 3000),  # 超过多数模型的 2048
        )
        passed = hard_filter(catalog, req)
        for e in passed:
            if e.max_resolution:
                assert e.max_resolution[0] >= 3000

    def test_duration_filter(self):
        """目标时长超限的模型被淘汰"""
        catalog = load_catalog()
        req = RouteRequest(
            required_capabilities=["video_gen"],
            user_region="cn",
            target_duration_s=45,  # kling-3.0 max 30s, seedance max 60s
        )
        passed = hard_filter(catalog, req)
        for e in passed:
            if e.max_duration_s is not None:
                assert e.max_duration_s >= 45

    def test_license_filter(self):
        """license 不合规的模型不进候选"""
        catalog = load_catalog()
        req = RouteRequest(
            required_capabilities=["inpaint"],
            user_region="cn",
        )
        passed = hard_filter(catalog, req)
        for e in passed:
            assert e.license_ok


class TestSoftScoring:
    """软评分"""

    def test_batch_fission_low_cost_first(self):
        """batch_fission 任务下低成本模型排前"""
        catalog = load_catalog()
        req = RouteRequest(
            required_capabilities=["image_gen"],
            task_type="batch_fission",
            user_region="cn",
        )
        result = route(req, catalog)
        # batch_fission 偏好低成本，budget 模型应排前
        assert result.selected.unit_cost_cny <= 0.15  # 不应选到 0.35+ 的

    def test_brand_keyvisual_high_quality_first(self):
        """brand_keyvisual 任务下高质量模型排前"""
        catalog = load_catalog()
        req = RouteRequest(
            required_capabilities=["image_gen", "inpaint"],
            task_type="brand_keyvisual",
            user_region="cn",
        )
        result = route(req, catalog)
        # brand_keyvisual 偏好高质量
        assert result.selected.quality >= 0.85

    def test_score_breakdown_recorded(self):
        """评分细项有记录"""
        catalog = load_catalog()
        req = RouteRequest(
            required_capabilities=["image_gen"],
            user_region="cn",
        )
        result = route(req, catalog)
        assert "quality" in result.score_breakdown
        assert "availability" in result.score_breakdown
        assert "latency" in result.score_breakdown
        assert "cost" in result.score_breakdown

    def test_route_reason_recorded(self):
        """route_reason 有留痕"""
        catalog = load_catalog()
        req = RouteRequest(
            required_capabilities=["image_gen"],
            user_region="cn",
        )
        result = route(req, catalog)
        assert "硬约束" in result.route_reason
        assert result.selected.alias in result.route_reason


class TestRouteErrors:
    """无候选报错"""

    def test_no_candidate_raises(self):
        """无候选时抛 NoCandidateError（不得降级将就）"""
        catalog = load_catalog()
        req = RouteRequest(
            required_capabilities=["nonexistent_capability_xyz"],
            user_region="cn",
        )
        with pytest.raises(NoCandidateError):
            route(req, catalog)

    def test_no_candidate_for_unknown_region(self):
        """未知区域无候选"""
        catalog = load_catalog()
        req = RouteRequest(
            required_capabilities=["image_gen"],
            user_region="mars",
        )
        with pytest.raises(NoCandidateError):
            route(req, catalog)


class TestTaskWeights:
    """任务权重表"""

    def test_default_weights(self):
        assert DEFAULT_WEIGHTS["quality"] == 0.40
        assert DEFAULT_WEIGHTS["availability"] == 0.25
        assert DEFAULT_WEIGHTS["latency"] == 0.20
        assert DEFAULT_WEIGHTS["cost"] == 0.15

    def test_brand_keyvisual_weights(self):
        w = TASK_WEIGHTS["brand_keyvisual"]
        assert w["quality"] == 0.50  # 品牌主图更看重质量

    def test_batch_fission_weights(self):
        w = TASK_WEIGHTS["batch_fission"]
        assert w["cost"] == 0.40  # 批量裂变更看重成本
