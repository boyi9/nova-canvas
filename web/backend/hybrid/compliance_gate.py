"""混制合规闸门（NC-HYB-08）：AI 标识 + 肖像/声音授权 + 原创度检测。

主文档 13.11；执行方案批 5。
抖音 2026 AI 内容标识规则（2025-09-01 起试行）：
  - 双轨标识：显式 + 隐式，无豁免场景
  - 展示方式：前 3 秒全程显示 或 全程角标 ≥2 秒
  - 标准话术：仅用 4 类标准话术
"""

from dataclasses import dataclass

# 抖音 2026 AI 内容标识规则（2025-09-01 起试行）
AI_LABEL_TEXTS = ["AI生成", "AI辅助创作", "人工智能生成", "本内容由AI生成"]
AI_LABEL_HEAD_SEC = 3.0        # 前 3 秒显示
AI_LABEL_CORNER_MIN_SEC = 2.0  # 或全程角标 >= 2 秒
DIGITAL_HUMAN_BIO_NOTICE = "本账号出镜为AI数字人生成"

# AI 来源集合（与 NC-HYB-01 AI_SOURCES 一致）
AI_SOURCES = ("ai_generated", "ai_pickup", "hybrid_composite")


@dataclass
class ComplianceReport:
    needs_ai_label: bool
    ai_shot_ids: list
    missing_talent_release: list
    missing_bgm_license: list
    label_plan: dict
    passed: bool


def check_hybrid(manifest: dict) -> ComplianceReport:
    """检查混制工程合规性，返回报告；passed=False 表示缺授权等硬伤。"""
    ai_shots = [s["shot_id"] for s in manifest["shots"]
                if s["source"] in AI_SOURCES]
    missing_release = [s["shot_id"] for s in manifest["shots"]
                       if s["source"] == "live_action"
                       and not s.get("compliance", {}).get("talent_release", False)]
    missing_bgm = [s["shot_id"] for s in manifest["shots"]
                   if not s.get("compliance", {}).get("bgm_license")]

    needs_label = len(ai_shots) > 0
    label_plan = {}
    if needs_label:
        label_plan = {
            "text": AI_LABEL_TEXTS[1],
            "mode": "head_or_corner",
            "head_sec": AI_LABEL_HEAD_SEC,
            "corner_min_sec": AI_LABEL_CORNER_MIN_SEC,
            "metadata_embed": True,     # 隐式标识（元数据）
            "bio_notice": DIGITAL_HUMAN_BIO_NOTICE,
        }

    passed = not missing_release and not missing_bgm
    return ComplianceReport(
        needs_ai_label=needs_label,
        ai_shot_ids=ai_shots,
        missing_talent_release=missing_release,
        missing_bgm_license=missing_bgm,
        label_plan=label_plan,
        passed=passed,
    )


def inject_ai_label(draft_builder, report: ComplianceReport, total_duration: float):
    """向剪映草稿注入显式标识（前 3 秒字幕 或 全程角标 >= 2 秒）。"""
    if not report.needs_ai_label:
        return draft_builder
    plan = report.label_plan
    draft_builder.add_text(
        track="overlay",
        text=plan["text"],
        start=0.0,
        duration=min(plan["head_sec"], total_duration),
        position="top_right",
        font_size=28,
        opacity=0.75,
    )
    return draft_builder