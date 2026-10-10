# -*- coding: utf-8 -*-
# file: backend/audio/catalog.py
# 作用：音频能力目录 —— 音色 / BGM 曲库 / 音效库
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

LANG_CN = "zh-CN"
LANG_EN = "en-US"
LANG_JA = "ja-JP"


@dataclass(frozen=True)
class VoiceDef:
    id: str
    name: str
    gender: str          # male | female | neutral
    lang: str
    style: str = "通用"
    sample_rate: int = 24000


@dataclass(frozen=True)
class BgmDef:
    id: str
    name: str
    mood: str            # 欢快 / 治愈 / 紧张 / 史诗 / 轻快 ...
    bpm: int
    duration_s: float
    tags: List[str] = field(default_factory=list)


@dataclass(frozen=True)
class SfxDef:
    id: str
    name: str
    category: str        # whoosh / impact / ui / nature / crowd
    duration_s: float


# ── 音色 ────────────────────────────────────────────────────────────────
VOICES: Dict[str, VoiceDef] = {
    v.id: v
    for v in [
        VoiceDef("zh_female_warm", "晓晓（女声·温暖）", "female", LANG_CN, "口播"),
        VoiceDef("zh_female_bright", "小晴（女声·明亮）", "female", LANG_CN, "口播"),
        VoiceDef("zh_male_steady", "建国（男声·沉稳）", "male", LANG_CN, "口播"),
        VoiceDef("zh_male_young", "小宇（男声·年轻）", "male", LANG_CN, "口播"),
        VoiceDef("en_female_neutral", "Ava (Female)", "female", LANG_EN, "Narration"),
        VoiceDef("en_male_neutral", "Ethan (Male)", "male", LANG_EN, "Narration"),
        VoiceDef("ja_female_neutral", "Hana (Female)", "female", LANG_JA, "Narration"),
    ]
}

# ── BGM 曲库 ────────────────────────────────────────────────────────────
BGM_LIBRARY: Dict[str, BgmDef] = {
    b.id: b
    for b in [
        BgmDef("bgm_upbeat_pop", "轻快流行", "轻快", 120, 92.0, ["电商", "口播"]),
        BgmDef("bgm_warm_acoustic", "温暖原声", "治愈", 88, 124.0, ["情感", "Vlog"]),
        BgmDef("bgm_epic_cinematic", "史诗电影", "史诗", 72, 156.0, ["影视", "短剧"]),
        BgmDef("bgm_tense_suspense", "紧张悬疑", "紧张", 96, 138.0, ["悬疑", "短剧"]),
        BgmDef("bgm_lofi_chill", "LoFi 轻闲", "轻闲", 82, 146.0, ["教程", "长视频"]),
        BgmDef("bgm_energetic_sport", "运动活力", "活力", 132, 78.0, ["运动", "带货"]),
    ]
}

# ── 音效库 ──────────────────────────────────────────────────────────────
SFX_LIBRARY: Dict[str, SfxDef] = {
    s.id: s
    for s in [
        SfxDef("sfx_whoosh_light", "轻快转场", "whoosh", 0.6),
        SfxDef("sfx_whoosh_heavy", "重度转场", "whoosh", 1.2),
        SfxDef("sfx_impact_hit", "撞击重音", "impact", 0.8),
        SfxDef("sfx_impact_pop", "气泡弹跳", "impact", 0.4),
        SfxDef("sfx_ui_click", "点击", "ui", 0.15),
        SfxDef("sfx_ui_success", "成功提示", "ui", 0.7),
        SfxDef("sfx_ui_error", "错误提示", "ui", 0.5),
        SfxDef("sfx_nature_rain", "雨声", "nature", 12.0),
        SfxDef("sfx_crowd_cheer", "人群欢呼", "crowd", 3.5),
    ]
}


class CatalogError(KeyError):
    """目录查询失败（音色/BGM/音效不存在）。"""


def get_voice(voice_id: str) -> VoiceDef:
    v = VOICES.get(voice_id)
    if v is None:
        raise CatalogError(f"未知音色: {voice_id}")
    return v


def list_voices(lang: str = "") -> List[VoiceDef]:
    return [v for v in VOICES.values() if not lang or v.lang == lang]


def list_bgm(mood: str = "") -> List[BgmDef]:
    return [b for b in BGM_LIBRARY.values() if not mood or b.mood == mood]


def list_sfx(category: str = "") -> List[SfxDef]:
    return [s for s in SFX_LIBRARY.values() if not category or s.category == category]