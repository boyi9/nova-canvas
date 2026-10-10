# -*- coding: utf-8 -*-
# file: tests/test_cap_input_spec.py
# 作用：NC-CAP-00 四类输入谱系统一解析接口测试
import pytest
from web.backend.models.input_spec import (
    InputType,
    InputSpec,
    resolve_input,
    I1_REQUIRED,
)
from web.backend.models.parsers.command_parser import parse_command
from web.backend.models.parsers.prompt_resolver import resolve_prompt
from web.backend.models.parsers.data_parser import parse_data


class TestI1Demand:
    """I1 需求输入：缺一即追问，禁止编造"""

    def test_missing_all_fields(self):
        """只说'帮我做个爆款' → missing 非空，ready=False"""
        spec = resolve_input(InputType.I1_DEMAND, "帮我做个爆款")
        assert not spec.ready
        assert "product_name" in spec.missing or "core_selling_point" in spec.missing

    def test_dict_with_all_fields(self):
        """dict 输入且字段齐全 → ready=True"""
        raw = {
            "product_name": "保温杯",
            "core_selling_point": "24小时保温",
            "target_platform": "抖音",
            "intent": "做一张主图",
        }
        spec = resolve_input(InputType.I1_DEMAND, raw)
        assert spec.ready
        assert spec.missing == []
        assert spec.normalized["product_name"] == "保温杯"

    def test_dict_missing_field(self):
        """dict 输入缺 target_platform → missing 包含该字段"""
        raw = {
            "product_name": "保温杯",
            "core_selling_point": "24小时保温",
        }
        spec = resolve_input(InputType.I1_DEMAND, raw)
        assert not spec.ready
        assert "target_platform" in spec.missing

    def test_heuristic_extract_product(self):
        """自然语言启发式提取商品名"""
        spec = resolve_input(InputType.I1_DEMAND, "帮我做一个保温杯的主图，卖点是保温，发抖音")
        assert "product_name" in spec.normalized
        assert "保温杯" in spec.normalized["product_name"]

    def test_empty_string(self):
        spec = resolve_input(InputType.I1_DEMAND, "")
        assert not spec.ready
        assert len(spec.missing) >= 1


class TestI2Command:
    """I2 指令输入：非法取值报错并列出合法值"""

    def test_json_command(self):
        spec = resolve_input(InputType.I2_COMMAND, '{"operation": "create", "target": "image"}')
        assert spec.ready
        assert spec.normalized["operation"] == "create"

    def test_kv_command(self):
        spec = resolve_input(InputType.I2_COMMAND, "operation=create; priority=high")
        assert spec.ready
        assert spec.normalized["operation"] == "create"
        assert spec.normalized["priority"] == "high"

    def test_pure_operation(self):
        spec = resolve_input(InputType.I2_COMMAND, "create")
        assert spec.ready
        assert spec.normalized["operation"] == "create"

    def test_invalid_command(self):
        """非法指令返回 missing"""
        spec = resolve_input(InputType.I2_COMMAND, "invalid_command_xyz")
        assert not spec.ready
        assert "command_parse_failed" in spec.missing

    def test_empty_command(self):
        spec = resolve_input(InputType.I2_COMMAND, "")
        assert not spec.ready


class TestI3Prompt:
    """I3 提示词输入：走资产库版本，不允许内联裸提示词"""

    def test_asset_lib_hit(self):
        """资产库 key 命中"""
        spec = resolve_input(InputType.I3_PROMPT, "ecom_main_image_v1")
        assert spec.ready
        assert spec.normalized["source"] == "asset_lib"
        assert spec.normalized["key"] == "ecom_main_image_v1"

    def test_inline_prompt_rejected(self):
        """内联裸提示词被拒绝"""
        spec = resolve_input(InputType.I3_PROMPT, "一只猫坐在窗台上，阳光明媚")
        assert not spec.ready
        assert "prompt_not_in_asset_lib" in spec.missing

    def test_empty_prompt(self):
        spec = resolve_input(InputType.I3_PROMPT, "")
        assert not spec.ready


class TestI4Data:
    """I4 数据输入：无阈值依据时不触发"""

    def test_metric_with_baseline(self):
        raw = {"channel": "metric", "name": "ctr", "value": 0.03, "baseline": 0.02}
        normalized, missing = parse_data(raw)
        assert missing == []
        assert normalized["channel"] == "metric"

    def test_metric_without_baseline(self):
        """无 baseline → missing"""
        raw = {"channel": "metric", "name": "ctr", "value": 0.03}
        normalized, missing = parse_data(raw)
        assert "baseline" in missing

    def test_metric_baseline_none(self):
        raw = {"channel": "metric", "name": "ctr", "value": 0.03, "baseline": None}
        normalized, missing = parse_data(raw)
        assert "baseline" in missing

    def test_feedback_channel(self):
        raw = {"channel": "feedback", "source": "user_123", "content": "太慢了"}
        normalized, missing = parse_data(raw)
        assert missing == []

    def test_invalid_channel(self):
        raw = {"channel": "unknown_channel"}
        normalized, missing = parse_data(raw)
        assert "channel" in missing or len(missing) >= 1

    def test_invalid_json_string(self):
        normalized, missing = parse_data("not json at all")
        assert "invalid_json" in missing

    def test_empty(self):
        normalized, missing = parse_data({})
        assert "empty_data" in missing

    def test_resolve_input_i4(self):
        """通过 resolve_input 走 I4"""
        raw = {"channel": "metric", "name": "ctr", "value": 0.03, "baseline": 0.02}
        spec = resolve_input(InputType.I4_DATA, raw)
        assert spec.ready
        assert spec.source_ref is not None
