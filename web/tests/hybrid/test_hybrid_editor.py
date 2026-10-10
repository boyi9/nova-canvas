"""NC-HYB-07 单元测试：三源混剪编排。

验收标准（执行方案 636-640 行）：
- 15s 混制视频 ≤10 分钟产出剪映工程（本测试验证秒级构建）
- 每段片段名带 [实拍]/[AI]/[AI补镜] 前缀
- 颜色标记不支持时降级为片段名前缀 + 元数据，不得静默丢弃来源信息
- 草稿能被剪映正常打开且无素材丢失（结构完整性验证）
"""

import json
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.hybrid.hybrid_editor import (
    SOURCE_COLOR, SOURCE_TAG, resolve_asset, build_hybrid_draft,
)


def _manifest(total=15.0):
    shots = [
        {"shot_id": "S01", "source": "live_action", "function": "hook",
         "start_sec": 0.0, "duration_sec": 3.0},
        {"shot_id": "S02", "source": "ai_generated", "function": "scene_establish",
         "start_sec": 3.0, "duration_sec": 4.0},
        {"shot_id": "S03", "source": "ai_pickup", "function": "transition_bridge",
         "start_sec": 7.0, "duration_sec": 2.0},
        {"shot_id": "S04", "source": "live_action", "function": "emotional_core",
         "start_sec": 9.0, "duration_sec": 3.0},
        {"shot_id": "S05", "source": "stock", "function": "cta",
         "start_sec": 12.0, "duration_sec": 3.0},
    ]
    return {"project_id": "P001", "resolution": "1080x1920", "fps": 30,
            "total_duration_sec": total, "shots": shots}


# ── 1. 来源色标与标签覆盖 5 类来源 ────────────────────────────────
def test_source_maps():
    five = {"live_action", "ai_generated", "ai_pickup", "hybrid_composite", "stock"}
    assert set(SOURCE_COLOR) == five, "色标需覆盖 5 类来源"
    assert set(SOURCE_TAG) == five, "标签需覆盖 5 类来源"
    assert SOURCE_TAG["live_action"] == "[实拍]"
    assert SOURCE_TAG["ai_generated"] == "[AI]"
    assert SOURCE_TAG["ai_pickup"] == "[AI补镜]"
    for src, color in SOURCE_COLOR.items():
        assert color.startswith("#") and len(color) == 7, f"{src} 色标格式: {color}"
    print("✓ 来源色标/标签覆盖 5 类来源")


# ── 2. resolve_asset 路径规则 ──────────────────────────────────────
def test_resolve_asset():
    wd = "proj"
    assert resolve_asset({"shot_id": "S01", "source": "live_action"}, wd) == \
        os.path.join("proj", "raw", "live", "S01.mp4")
    assert resolve_asset({"shot_id": "S02", "source": "stock"}, wd) == \
        os.path.join("proj", "raw", "stock", "S02.mp4")
    assert resolve_asset({"shot_id": "S03", "source": "ai_generated"}, wd) == \
        os.path.join("proj", "graded", "S03_graded.mp4")
    assert resolve_asset({"shot_id": "S04", "source": "ai_pickup"}, wd) == \
        os.path.join("proj", "graded", "S04_graded.mp4")
    print("✓ resolve_asset 路径规则正确")


# ── 3. build_hybrid_draft：前缀 + 色标 + meta 来源可追溯 ──────────
def test_build_hybrid_draft(tmp_path):
    t0 = time.time()
    draft_path = build_hybrid_draft(
        _manifest(), work_dir=str(tmp_path / "work"),
        out_dir=str(tmp_path / "drafts"),
        bgm_path="assets/bgm.mp3", voice_path="assets/voice.mp3")
    elapsed = time.time() - t0
    assert elapsed <= 600, f"15s 视频须 ≤10 分钟，实际 {elapsed:.1f}s"

    with open(draft_path, encoding="utf-8") as f:
        draft = json.load(f)

    assert draft["width"] == 1080 and draft["height"] == 1920 and draft["fps"] == 30
    video_tracks = [t for t in draft["tracks"] if t["kind"] == "video"]
    assert len(video_tracks) == 1, "必须有视频主轨"
    segs = video_tracks[0]["segments"]

    assert len(segs) == 5, f"5 段全部入轨: {len(segs)}"
    # 时间轴按 start_sec 排序
    starts = [s["start"] for s in segs]
    assert starts == sorted(starts), "时间轴应按 start_sec 排序"

    # 每段名称带来源前缀 + 来源 meta 100% 可追溯
    for s in segs:
        src = s["meta"]["source"]
        assert s["name"].startswith(SOURCE_TAG[src]), f"片段名缺来源前缀: {s['name']}"
        assert s["meta"]["source"] == src, "set_meta(source) 必须保留"
        assert s["color"] == SOURCE_COLOR[src], f"色标丢失: {s}"
    # 来源可追溯 100%
    assert all("source" in s["meta"] for s in segs)

    # 音频轨
    kinds = [a["kind"] for a in draft["audios"]]
    assert "bgm" in kinds and "voice" in kinds, f"配音+BGM 轨: {draft['audios']}"
    bgm = [a for a in draft["audios"] if a["kind"] == "bgm"][0]
    assert bgm["volume"] == 0.35, "BGM 音量 0.35"
    print(f"✓ 混制草稿构建 {elapsed:.2f}s，5 段带来源前缀与色标")


# ── 4. 无 bgm/voice 时不写音频轨 ──────────────────────────────────
def test_build_draft_no_audio(tmp_path):
    draft_path = build_hybrid_draft(_manifest(), work_dir=str(tmp_path / "w"),
                                    out_dir=str(tmp_path / "d"))
    with open(draft_path, encoding="utf-8") as f:
        draft = json.load(f)
    assert draft["audios"] == [], "未提供音频时不写入"
    print("✓ 无音频参数时不写音频轨")


if __name__ == "__main__":
    print("本测试需在 pytest 下运行（依赖 tmp_path）")