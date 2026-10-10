"""NC-HYB-01 单元测试：Shot Manifest 校验规则。

覆盖 8 条核心校验规则，每条至少 1 个正例 + 1 个反例。
"""
import sys
import os
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.hybrid.shot_manifest import load, validate, source_summary
from backend.hybrid.models import ShotManifest, Shot, ComplianceInfo, LightingInfo, SubjectLock


def test_rule_1_emotional_core_must_be_live_action():
    """规则 1：情感核心镜头必须为 live_action，AI 源头应被拦截。"""
    shots = [
        Shot(
            shot_id="S01", start_sec=0.0, duration_sec=3.0,
            function="emotional_core", source="ai_generated",
            compliance=ComplianceInfo()
        )
    ]
    m = ShotManifest(project_id="P001", shots=shots)
    problems = validate(m)
    assert any("情感核心镜头必须实拍" in p for p in problems), f"预期拦截 emotional_core + ai_generated，实际问题: {problems}"
    print("✓ Rule 1 passed: emotional_core + ai_generated 被拦截")


def test_rule_2_ai_prompt_and_seed():
    """规则 2：AI 来源必须带 ai_prompt 与 seed。"""
    # 正例：齐全
    shots = [Shot(
        shot_id="S01", start_sec=0.0, duration_sec=3.0,
        function="product_show", source="ai_generated",
        ai_prompt="test prompt", seed=20260925,
        compliance=ComplianceInfo(needs_ai_label=True),
        color_ref_frame="assets/ref/S01_ref.png"
    )]
    m = ShotManifest(project_id="P001", shots=shots)
    problems = validate(m)
    assert len(problems) == 0, f"正例应通过校验，实际问题: {problems}"
    print("✓ Rule 2 positive: AI 有 ai_prompt + seed 通过校验")

    # 反例：缺少 ai_prompt
    shots2 = [Shot(
        shot_id="S02", start_sec=0.0, duration_sec=3.0,
        function="product_show", source="ai_generated",
        seed=20260925,
        compliance=ComplianceInfo()
    )]
    m2 = ShotManifest(project_id="P001", shots=shots2)
    problems2 = validate(m2)
    assert any("AI 来源缺少 ai_prompt" in p for p in problems2), f"预期拦截缺失 ai_prompt，实际: {problems2}"
    print("✓ Rule 2 negative: 缺失 ai_prompt 被拦截")

    # 反例：缺少 seed
    shots3 = [Shot(
        shot_id="S03", start_sec=0.0, duration_sec=3.0,
        function="product_show", source="ai_generated",
        ai_prompt="test", compliance=ComplianceInfo()
    )]
    m3 = ShotManifest(project_id="P001", shots=shots3)
    problems3 = validate(m3)
    assert any("AI 来源缺少 seed" in p for p in problems3), f"预期拦截缺失 seed，实际: {problems3}"
    print("✓ Rule 2 negative: 缺少 seed 被拦截")


def test_rule_3_ai_must_label():
    """规则 3：AI 来源必须设置 needs_ai_label=True。"""
    shots = [Shot(
        shot_id="S04", start_sec=0.0, duration_sec=2.0,
        function="hook", source="ai_generated",
        ai_prompt="", seed=1,
        compliance=ComplianceInfo(needs_ai_label=False)  # False 应被拦截
    )]
    m = ShotManifest(project_id="P001", shots=shots)
    problems = validate(m)
    assert any("AI 来源必须设置 needs_ai_label=True" in p for p in problems), f"预期拦截 needs_ai_label=False，实际: {problems}"
    print("✓ Rule 3: needs_ai_label=False 被拦截")

    # 正例：True 通过
    shots2 = [Shot(
        shot_id="S05", start_sec=0.0, duration_sec=2.0,
        function="hook", source="ai_generated",
        ai_prompt="fast hook closeup", seed=1,
        compliance=ComplianceInfo(needs_ai_label=True),
        color_ref_frame="assets/ref/S05_ref.png"
    )]
    m2 = ShotManifest(project_id="P001", shots=shots2)
    problems2 = validate(m2)
    assert len(problems2) == 0, f"正例应通过，实际: {problems2}"
    print("✓ Rule 3 positive: needs_ai_label=True 通过校验")


def test_rule_4_live_action_talent_release():
    """规则 4：实拍素材必须确认 talent_release（肖像授权）。"""
    # 反例：缺少肖像授权
    shots = [Shot(
        shot_id="S06", start_sec=0.0, duration_sec=5.0,
        function="hook", source="live_action",
        compliance=ComplianceInfo(talent_release=False)
    )]
    m = ShotManifest(project_id="P001", shots=shots)
    problems = validate(m)
    assert any("肖像授权确认" in p for p in problems), f"预期拦截无才释放，实际: {problems}"
    print("✓ Rule 4: live_action + talent_release=False 被拦截")

    # 正例：有授权
    shots2 = [Shot(
        shot_id="S07", start_sec=0.0, duration_sec=5.0,
        function="hook", source="live_action",
        compliance=ComplianceInfo(talent_release=True)
    )]
    m2 = ShotManifest(project_id="P001", shots=shots2)
    problems2 = validate(m2)
    assert len(problems2) == 0, f"正例应通过，实际: {problems2}"
    print("✓ Rule 4 positive: live_action + talent_release=True 通过校验")


def test_rule_5_ecommerce_product_show():
    """规则 5：电商项目 product_show 必须 product_is_real_shoot。"""
    # 反例：电商项目但标记为非实拍
    shots = [Shot(
        shot_id="S08", start_sec=0.0, duration_sec=4.0,
        function="product_show", source="ai_generated",
        compliance=ComplianceInfo(product_is_real_shoot=False)
    )]
    m = ShotManifest(project_id="P001", project_type="ecommerce_short_video", shots=shots)
    problems = validate(m)
    assert any("商品展示镜头必须实拍商品本体" in p for p in problems), f"预期拦截，实际: {problems}"
    print("✓ Rule 5: ecommerce + product_show + product_is_real_shoot=False 被拦截")

    # 正例：电商项目且标记为实拍
    shots2 = [Shot(
        shot_id="S09", start_sec=0.0, duration_sec=4.0,
        function="product_show", source="ai_generated",
        ai_prompt="product hero shot", seed=7,
        compliance=ComplianceInfo(product_is_real_shoot=True, needs_ai_label=True),
        color_ref_frame="assets/ref/S09_ref.png"
    )]
    m2 = ShotManifest(project_id="P001", project_type="ecommerce_short_video", shots=shots2)
    problems2 = validate(m2)
    assert len(problems2) == 0, f"正例应通过，实际: {problems2}"
    print("✓ Rule 5 positive: ecommerce + product_show + product_is_real_shoot=True 通过校验")


def test_rule_6_ai_must_have_color_ref_frame():
    """规则 6：AI 片段必须有 color_ref_frame（色彩参考帧）。"""
    shots = [Shot(
        shot_id="S10", start_sec=0.0, duration_sec=3.0,
        function="transition_bridge", source="ai_generated",
        ai_prompt="bridge", seed=1,
        compliance=ComplianceInfo(),
        color_ref_frame=None  # None 应被拦截
    )]
    m = ShotManifest(project_id="P001", shots=shots)
    problems = validate(m)
    assert any("AI 片段缺少 color_ref_frame" in p for p in problems), f"预期拦截，实际: {problems}"
    print("✓ Rule 6: AI 片段无 color_ref_frame 被拦截")

    # 正例：有参考帧
    shots2 = [Shot(
        shot_id="S11", start_sec=0.0, duration_sec=3.0,
        function="transition_bridge", source="ai_generated",
        ai_prompt="bridge", seed=1,
        compliance=ComplianceInfo(needs_ai_label=True),
        color_ref_frame="assets/ref/S11_ref.png"
    )]
    m2 = ShotManifest(project_id="P001", shots=shots2)
    problems2 = validate(m2)
    assert len(problems2) == 0, f"正例应通过，实际: {problems2}"
    print("✓ Rule 6 positive: AI 有 color_ref_frame 通过校验")


def test_rule_7_duration_consistency():
    """规则 7：镜头时长总和与 total_duration_sec 一致（容差 0.5s）。"""
    # 正例：总和匹配
    shots = [Shot(
        shot_id="S12", start_sec=0.0, duration_sec=3.0,
        function="hook", source="live_action",
        compliance=ComplianceInfo(talent_release=True)
    ), Shot(
        shot_id="S13", start_sec=3.0, duration_sec=2.5,
        function="product_show", source="live_action",
        compliance=ComplianceInfo(talent_release=True)
    )]
    m = ShotManifest(project_id="P001", shots=shots, total_duration_sec=5.5)
    problems = validate(m)
    assert len(problems) == 0, f"正例应通过（总和 5.5s），实际: {problems}"
    print("✓ Rule 7 positive: 总时长 5.5s 匹配")

    # 反例：总和不匹配
    shots2 = [Shot(
        shot_id="S14", start_sec=0.0, duration_sec=3.0,
        function="hook", source="live_action",
        compliance=ComplianceInfo()
    ), Shot(
        shot_id="S15", start_sec=3.0, duration_sec=2.5,
        function="product_show", source="live_action",
        compliance=ComplianceInfo()
    )]
    m2 = ShotManifest(project_id="P001", shots=shots2, total_duration_sec=10.0)  # 错误：应为 5.5
    problems2 = validate(m2)
    assert any("不一致" in p for p in problems2), f"预期拦截总时长不一致，实际: {problems2}"
    print("✓ Rule 7 negative: 总时长不匹配被拦截")


def test_rule_8_no_time_overlap():
    """规则 8：镜头时间轴不重叠。"""
    # 正例：无重叠
    shots = [Shot(
        shot_id="S16", start_sec=0.0, duration_sec=3.0,
        function="hook", source="live_action",
        compliance=ComplianceInfo(talent_release=True)
    ), Shot(
        shot_id="S17", start_sec=3.0, duration_sec=2.0,
        function="product_show", source="live_action",
        compliance=ComplianceInfo(talent_release=True)
    )]
    m = ShotManifest(project_id="P001", shots=shots)
    problems = validate(m)
    assert len(problems) == 0, f"正例应通过（无重叠），实际: {problems}"
    print("✓ Rule 8 positive: 时间轴无重叠")

    # 反例：有重叠
    shots2 = [Shot(
        shot_id="S18", start_sec=0.0, duration_sec=3.0,
        function="hook", source="live_action",
        compliance=ComplianceInfo()
    ), Shot(
        shot_id="S19", start_sec=2.5, duration_sec=2.0,
        function="product_show", source="live_action",
        compliance=ComplianceInfo()
    )]
    m2 = ShotManifest(project_id="P001", shots=shots2)
    problems2 = validate(m2)
    assert any("时间轴重叠" in p for p in problems2), f"预期拦截时间轴重叠，实际: {problems2}"
    print("✓ Rule 8 negative: 时间轴重叠被拦截")


def test_source_summary():
    """测试 source_summary：返回各来源的时长占比。"""
    shots = [
        Shot("S20", 0.0, 3.0, "hook", "live_action", compliance=ComplianceInfo()),
        Shot("S21", 3.0, 2.0, "product_show", "ai_generated", compliance=ComplianceInfo()),
        Shot("S22", 5.0, 4.0, "transition_bridge", "ai_pickup", compliance=ComplianceInfo()),
    ]
    m = ShotManifest(project_id="P001", shots=shots, total_duration_sec=9.0)
    summary = source_summary(m)
    # 总时长 9s：live_action 3/9=33.3%，ai_generated 2/9=22.2%，ai_pickup 4/9=44.4%
    assert abs(summary["live_action"] - 33.3) < 0.1, f"预期 33.3，实际 {summary['live_action']}"
    assert abs(summary["ai_generated"] - 22.2) < 0.1, f"预期 22.2，实际 {summary['ai_generated']}"
    assert abs(summary["ai_pickup"] - 44.4) < 0.1, f"预期 44.4，实际 {summary['ai_pickup']}"
    print(f"✓ source_summary: {summary}")


def main():
    test_rule_1_emotional_core_must_be_live_action()
    test_rule_2_ai_prompt_and_seed()
    test_rule_3_ai_must_label()
    test_rule_4_live_action_talent_release()
    test_rule_5_ecommerce_product_show()
    test_rule_6_ai_must_have_color_ref_frame()
    test_rule_7_duration_consistency()
    test_rule_8_no_time_overlap()
    test_source_summary()
    print("\n🎉 所有 NC-HYB-01 单元测试通过！")


if __name__ == "__main__":
    main()