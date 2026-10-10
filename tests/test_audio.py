# -*- coding: utf-8 -*-
# tests/test_audio.py —— P2-3 音频生成：TTS / BGM / SFX / 混音
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from web.backend.audio import (
    AudioError,
    atempo_ratio,
    build_mix_plan,
    get_audio_engine,
    list_bgm,
    list_sfx,
    list_voices,
    MixTrack,
    normalize_gain,
    reset_audio_engine,
)
from web.backend.main import create_app

client = TestClient(create_app())


@pytest.fixture(autouse=True)
def _clean():
    reset_audio_engine()
    yield
    reset_audio_engine()


class TestCatalog:
    def test_voices_non_empty(self):
        assert len(list_voices()) >= 5

    def test_filter_voices_by_lang(self):
        zh = list_voices("zh-CN")
        assert zh and all(v.lang == "zh-CN" for v in zh)

    def test_bgm_and_sfx(self):
        assert len(list_bgm()) >= 5
        assert len(list_sfx()) >= 8

    def test_api_catalog(self):
        r = client.get("/api/audio/catalog")
        assert r.status_code == 200
        d = r.json()
        assert d["voices"] and d["bgm"] and d["sfx"]

    def test_api_filter(self):
        d = client.get("/api/audio/catalog?category=whoosh").json()
        assert all(s["category"] == "whoosh" for s in d["sfx"])


class TestTts:
    def test_plan_ok(self):
        r = client.post("/api/audio/tts", json={"text": "618 大促，今天开抢", "voice_id": "zh_female_warm"})
        assert r.status_code == 200
        d = r.json()
        assert d["kind"] == "tts"
        assert d["params"]["chars"] == 11
        assert d["estimated_duration_s"] > 0

    def test_empty_text_rejected(self):
        r = client.post("/api/audio/tts", json={"text": "  ", "voice_id": "zh_female_warm"})
        assert r.status_code == 400

    def test_unknown_voice_rejected(self):
        r = client.post("/api/audio/tts", json={"text": "hi", "voice_id": "nope"})
        assert r.status_code == 400

    def test_too_long_rejected(self):
        r = client.post("/api/audio/tts", json={"text": "字" * 3000, "voice_id": "zh_female_warm"})
        assert r.status_code == 400

    def test_speed_changes_duration(self):
        slow = client.post(
            "/api/audio/tts", json={"text": "测试文本内容", "voice_id": "zh_female_warm", "speed": 0.5}
        ).json()
        fast = client.post(
            "/api/audio/tts", json={"text": "测试文本内容", "voice_id": "zh_female_warm", "speed": 2.0}
        ).json()
        assert slow["estimated_duration_s"] > fast["estimated_duration_s"]

    def test_speed_clamped(self):
        d = client.post(
            "/api/audio/tts", json={"text": "abc", "voice_id": "en_female_neutral", "speed": 99}
        ).json()
        assert d["params"]["speed"] == 2.0

    def test_cost_scales_with_length(self):
        short = client.post("/api/audio/tts", json={"text": "短", "voice_id": "zh_female_warm"}).json()
        long = client.post("/api/audio/tts", json={"text": "长" * 50, "voice_id": "zh_female_warm"}).json()
        assert long["estimated_cost_cny"] > short["estimated_cost_cny"]

    def test_english_duration_model(self):
        d = client.post(
            "/api/audio/tts", json={"text": "a" * 70, "voice_id": "en_female_neutral"}
        ).json()
        # 70 字符 / 14 每秒 ≈ 5s
        assert 3.0 < d["estimated_duration_s"] < 8.0


class TestBgm:
    def test_plan_ok(self):
        r = client.post("/api/audio/bgm", json={"bgm_id": "bgm_upbeat_pop", "duration_s": 30})
        assert r.status_code == 200
        assert r.json()["params"]["bpm"] == 120

    def test_unknown_bgm_rejected(self):
        assert client.post("/api/audio/bgm", json={"bgm_id": "nope"}).status_code == 400

    def test_loop_allows_longer_than_source(self):
        d = client.post(
            "/api/audio/bgm", json={"bgm_id": "bgm_upbeat_pop", "duration_s": 600, "loop": True}
        ).json()
        assert d["estimated_duration_s"] == 600

    def test_non_loop_capped_at_source_length(self):
        d = client.post(
            "/api/audio/bgm", json={"bgm_id": "bgm_upbeat_pop", "duration_s": 600, "loop": False}
        ).json()
        assert d["estimated_duration_s"] == 92.0

    def test_volume_clamped(self):
        d = client.post(
            "/api/audio/bgm", json={"bgm_id": "bgm_upbeat_pop", "volume": 5.0}
        ).json()
        assert d["params"]["volume"] == 1.0


class TestSfx:
    def test_plan_ok(self):
        r = client.post("/api/audio/sfx", json={"sfx_id": "sfx_ui_success"})
        assert r.status_code == 200
        assert r.json()["params"]["category"] == "ui"

    def test_unknown_sfx_rejected(self):
        assert client.post("/api/audio/sfx", json={"sfx_id": "nope"}).status_code == 400

    def test_negative_offset_clamped(self):
        d = client.post("/api/audio/sfx", json={"sfx_id": "sfx_ui_click", "offset_s": -5}).json()
        assert d["params"]["offset_s"] == 0.0


class TestBatch:
    def test_mixed_batch(self):
        r = client.post(
            "/api/audio/batch",
            json={
                "requests": [
                    {"kind": "tts", "text": "旁白", "voice_id": "zh_female_warm"},
                    {"kind": "bgm", "bgm_id": "bgm_warm_acoustic"},
                    {"kind": "sfx", "sfx_id": "sfx_ui_success"},
                ]
            },
        )
        assert r.status_code == 200
        assert r.json()["total"] == 3
        assert r.json()["total_cost_cny"] > 0

    def test_batch_rolls_back_on_failure(self):
        r = client.post(
            "/api/audio/batch",
            json={
                "requests": [
                    {"kind": "tts", "text": "ok", "voice_id": "zh_female_warm"},
                    {"kind": "bgm", "bgm_id": "bad_id"},
                ]
            },
        )
        assert r.status_code == 400
        # 已成功的任务不应残留
        assert get_audio_engine().list_jobs() == []

    def test_empty_batch_rejected(self):
        assert client.post("/api/audio/batch", json={"requests": []}).status_code == 400

    def test_unknown_kind_rejected(self):
        r = client.post("/api/audio/batch", json={"requests": [{"kind": "nope"}]})
        assert r.status_code == 400


class TestJobsAndBudget:
    def test_list_jobs(self):
        client.post("/api/audio/tts", json={"text": "a", "voice_id": "zh_female_warm"})
        r = client.get("/api/audio/jobs").json()
        assert r["total"] == 1

    def test_get_job_detail(self):
        jid = client.post(
            "/api/audio/tts", json={"text": "a", "voice_id": "zh_female_warm"}
        ).json()["job_id"]
        assert client.get(f"/api/audio/jobs/{jid}").status_code == 200

    def test_missing_job_404(self):
        assert client.get("/api/audio/jobs/nope").status_code == 404

    def test_budget_sum(self):
        a = client.post("/api/audio/tts", json={"text": "x" * 10, "voice_id": "zh_female_warm"}).json()
        b = client.post("/api/audio/tts", json={"text": "y" * 20, "voice_id": "zh_female_warm"}).json()
        r = client.get(f"/api/audio/budget?job_ids={a['job_id']},{b['job_id']}").json()
        expected = a["estimated_cost_cny"] + b["estimated_cost_cny"]
        assert abs(r["total_cost_cny"] - expected) < 1e-6


class TestMixer:
    def test_normalize_gain(self):
        assert normalize_gain(1.0) == 0.0
        assert normalize_gain(0.5) == -6.02
        assert normalize_gain(0.0) == -60.0

    def test_atempo_ratio(self):
        assert atempo_ratio(120, 120) == 1.0
        assert atempo_ratio(60, 120) == 0.5
        # 超出 atempo 可用区间时钳制
        assert atempo_ratio(600, 120) == 2.0
        assert atempo_ratio(30, 120) == 0.5

    def test_ducking_applied_when_voice_overlaps(self):
        voice = MixTrack("v", "voice", 0.0, 10.0, 0.0)
        bgm = MixTrack("b", "bgm", 0.0, 30.0, -6.0, duck_under_voice=True)
        plan = build_mix_plan(voice, bgm)
        # 人声与 BGM 重叠 → 峰值取人声 0dB，BGM 被压低
        assert plan.peak_gain_db == 0.0
        assert plan.total_duration_s == 30.0

    def test_no_ducking_when_no_voice(self):
        bgm = MixTrack("b", "bgm", 0.0, 30.0, -6.0, duck_under_voice=True)
        plan = build_mix_plan(None, bgm)
        assert plan.peak_gain_db == -6.0
        assert any("未检测到人声" in w for w in plan.warnings)

    def test_master_ceiling_warning(self):
        voice = MixTrack("v", "voice", 0.0, 5.0, 0.0)
        sfx = MixTrack("s", "sfx", 1.0, 1.0, 3.0)
        plan = build_mix_plan(voice, None, [sfx], master_ceiling_db=-1.0)
        assert plan.peak_gain_db == 3.0
        assert any("超过母线上限" in w for w in plan.warnings)

    def test_total_duration_is_max_end(self):
        voice = MixTrack("v", "voice", 2.0, 5.0, 0.0)
        plan = build_mix_plan(voice, None)
        assert plan.total_duration_s == 7.0

    def test_empty_plan(self):
        plan = build_mix_plan(None, None)
        assert plan.total_duration_s == 0.0
        assert plan.tracks == []

    def test_mix_api(self):
        r = client.post(
            "/api/audio/mix",
            json={
                "voice": {"track_id": "v", "kind": "voice", "duration_s": 5, "gain_db": 0},
                "bgm": {"track_id": "b", "kind": "bgm", "duration_s": 20, "gain_db": -6, "duck_under_voice": True},
            },
        )
        assert r.status_code == 200
        assert r.json()["total_duration_s"] == 20.0

    def test_gain_tool(self):
        assert client.get("/api/audio/tools/gain?volume=0.5").json()["gain_db"] == -6.02

    def test_atempo_tool(self):
        d = client.get("/api/audio/tools/atempo?target_bpm=90&current_bpm=120").json()
        assert d["ratio"] == 0.75
        assert d["clamped"] is False