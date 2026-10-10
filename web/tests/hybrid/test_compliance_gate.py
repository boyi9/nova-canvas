"""NC-HYB-08 单元测试：混制合规闸门。

验收标准（执行方案，批 5）：
- AI 片段 100% 标识
- 缺授权时 passed=False
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.hybrid.compliance_gate import (
    AI_LABEL_TEXTS, AI_LABEL_HEAD_SEC, AI_LABEL_CORNER_MIN_SEC,
    DIGITAL_HUMAN_BIO_NOTICE, ComplianceReport, check_hybrid, inject_ai_label,
)
from backend.generators.jianying_generator import JianyingDraftBuilder


def _manifest(shots):
    return {"project_id": "P001", "shots": shots}


def _live(sid, talent=True, bgm="lib/nc-001"):
    return {"shot_id": sid, "source": "live_action",
            "compliance": {"talent_release": talent, "bgm_license": bgm}}


def _ai(sid):
    return {"shot_id": sid, "source": "ai_generated",
            "compliance": {"talent_release": False, "bgm_license": "lib/nc-001"}}


# ── 1. 有 AI 片段 → 必须标识 ──────────────────────────────────────
def test_ai_shots_need_label():
    r = check_hybrid(_manifest([_live("S01"), _ai("S02"), _ai("S03")]))
    assert r.needs_ai_label is True, "有 AI 片段必须标识"
    assert set(r.ai_shot_ids) == {"S02", "S03"}
    assert r.label_plan["text"] in AI_LABEL_TEXTS, "必须用 4 类标准话术"
    assert r.label_plan["head_sec"] == AI_LABEL_HEAD_SEC == 3.0, "前 3 秒显示"
    assert r.label_plan["corner_min_sec"] == AI_LABEL_CORNER_MIN_SEC == 2.0, "角标 ≥2 秒"
    assert r.label_plan["metadata_embed"] is True, "隐式标识（元数据）双轨"
    assert r.label_plan["bio_notice"] == DIGITAL_HUMAN_BIO_NOTICE
    assert r.passed is True, "授权齐全应通过"
    print(f"✓ AI 标识计划: {r.label_plan}")


# ── 2. 纯实拍工程 → 无需标识 ──────────────────────────────────────
def test_pure_live_no_label():
    r = check_hybrid(_manifest([_live("S01"), _live("S02", talent=True)]))
    assert r.needs_ai_label is False
    assert r.ai_shot_ids == []
    assert r.label_plan == {}
    assert r.passed is True
    print("✓ 纯实拍无需 AI 标识且 passed=True")


# ── 3. 缺肖像授权 → passed=False ──────────────────────────────────
def test_missing_talent_release():
    r = check_hybrid(_manifest([_live("S01", talent=False), _live("S02", talent=True)]))
    assert r.missing_talent_release == ["S01"], f"缺授权清单: {r.missing_talent_release}"
    assert r.passed is False, "缺肖像授权必须 passed=False"
    print("✓ 缺肖像授权 passed=False")


# ── 4. 缺 BGM 授权 → passed=False ─────────────────────────────────
def test_missing_bgm_license():
    shots = [_live("S01", bgm=None), _live("S02", bgm="lib/ok")]
    r = check_hybrid(_manifest(shots))
    assert r.missing_bgm_license == ["S01"], f"缺 BGM 授权: {r.missing_bgm_license}"
    assert r.passed is False, "缺 BGM 授权必须 passed=False"
    print("✓ 缺 BGM 授权 passed=False")


# ── 5. AI 片段 100% 标识（含 pickup / composite） ────────────────
def test_all_ai_source_types_labeled():
    shots = [
        {"shot_id": "A", "source": "ai_generated", "compliance": {}},
        {"shot_id": "B", "source": "ai_pickup", "compliance": {}},
        {"shot_id": "C", "source": "hybrid_composite", "compliance": {}},
        {"shot_id": "D", "source": "stock", "compliance": {"bgm_license": "x"}},
    ]
    r = check_hybrid(_manifest(shots))
    assert set(r.ai_shot_ids) == {"A", "B", "C"}, f"AI 源全覆盖: {r.ai_shot_ids}"
    assert r.needs_ai_label is True
    print("✓ 三类 AI 来源 100% 纳入标识")


# ── 6. inject_ai_label：写入前 3 秒标识 ───────────────────────────
def test_inject_ai_label():
    r = check_hybrid(_manifest([_live("S01"), _ai("S02")]))
    b = JianyingDraftBuilder(draft_name="P001")
    inject_ai_label(b, r, total_duration=15.0)
    assert len(b.texts) == 1, "应写入 1 条标识字幕"
    t = b.texts[0]
    assert t["text"] in AI_LABEL_TEXTS
    assert t["start"] == 0.0
    assert t["duration"] == 3.0, "前 3 秒显示"
    assert t["track"] == "overlay"
    print(f"✓ 标识注入: {t}")


def test_inject_label_short_video():
    r = check_hybrid(_manifest([_ai("S01")]))
    b = JianyingDraftBuilder(draft_name="P002")
    inject_ai_label(b, r, total_duration=2.0)   # 总时长 < 3s
    assert b.texts[0]["duration"] == 2.0, "总时长不足 3 秒按时长截断"
    print("✓ 短视频标识时长截断正确")


def test_inject_no_label_no_text():
    r = check_hybrid(_manifest([_live("S01")]))
    b = JianyingDraftBuilder(draft_name="P003")
    inject_ai_label(b, r, total_duration=15.0)
    assert b.texts == [], "纯实拍不应写标识"
    print("✓ 无 AI 片段不注入标识")


# ── 7. 合规报告可 JSON 序列化（发布前弹窗展示） ───────────────────
def test_report_json_serializable():
    import json
    from dataclasses import asdict
    r = check_hybrid(_manifest([_live("S01", talent=False), _ai("S02")]))
    text = json.dumps(asdict(r), ensure_ascii=False)
    data = json.loads(text)
    assert data["passed"] is False
    assert data["missing_talent_release"] == ["S01"]
    assert data["needs_ai_label"] is True
    assert "label_plan" in data and data["label_plan"]["text"] in AI_LABEL_TEXTS
    print(f"✓ 合规报告 JSON 序列化成功（{len(text)} 字节）")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn) and fn.__code__.co_argcount == 0:
            fn()
    print("\n🎉 所有 NC-HYB-08 单元测试通过！")