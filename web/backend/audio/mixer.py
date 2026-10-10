# -*- coding: utf-8 -*-
# file: backend/audio/mixer.py
# 作用：混音计划 —— 人声/BGM/音效 的音量、闪避(ducking) 与时间对齐
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List


@dataclass
class MixTrack:
    track_id: str
    kind: str                # voice | bgm | sfx
    start_s: float = 0.0
    duration_s: float = 0.0
    gain_db: float = 0.0
    # 闪避：当人声活跃时 BGM 降量
    duck_under_voice: bool = False


@dataclass
class MixPlan:
    tracks: List[MixTrack] = field(default_factory=list)
    total_duration_s: float = 0.0
    peak_gain_db: float = 0.0
    warnings: List[str] = field(default_factory=list)


def normalize_gain(value: float) -> float:
    """把 0..1 线性音量换算为 dB（0 → -inf，用 -60 兜底）。"""
    if value <= 0:
        return -60.0
    return round(20.0 * math.log10(min(value, 1.0)), 2)


def atempo_ratio(target_bpm: int, current_bpm: int) -> float:
    """按目标 BPM 计算变速倍率（atempo 常用区间 0.5~2.0）。"""
    if current_bpm <= 0:
        return 1.0
    ratio = target_bpm / current_bpm
    return round(max(0.5, min(2.0, ratio)), 3)


def build_mix_plan(
    voice: MixTrack | None,
    bgm: MixTrack | None,
    sfx: List[MixTrack] | None = None,
    master_ceiling_db: float = -1.0,
) -> MixPlan:
    """
    组装混音计划：
    - BGM 默认在 voice 播放区间内闪避（降 12dB）
    - 总增益不得超过 master ceiling，超出则记警告
    """
    sfx = sfx or []
    tracks: List[MixTrack] = []
    warnings: List[str] = []

    if voice:
        tracks.append(voice)
    if bgm:
        bgm.duck_under_voice = bgm.duck_under_voice and voice is not None
        tracks.append(bgm)
    tracks.extend(sfx)

    total = max(
        [t.start_s + t.duration_s for t in tracks] or [0.0]
    )

    # 峰值估算：人声与 BGM 同时段叠加，闪避后再取最大值
    peak = -60.0
    if voice:
        peak = max(peak, voice.gain_db)
    if bgm:
        bgm_gain = bgm.gain_db - (12.0 if bgm.duck_under_voice else 0.0)
        overlap = bool(voice) and not (
            bgm.start_s + bgm.duration_s <= voice.start_s
            or bgm.start_s >= voice.start_s + voice.duration_s
        )
        peak = max(peak, bgm_gain if overlap else bgm.gain_db)
    for s in sfx:
        peak = max(peak, s.gain_db)

    if peak > master_ceiling_db:
        warnings.append(
            f"峰值 {peak}dB 超过母线上限 {master_ceiling_db}dB，建议整体下压 "
            f"{round(peak - master_ceiling_db, 2)}dB"
        )

    if not voice:
        warnings.append("未检测到人声，BGM 将保持原始音量")

    return MixPlan(
        tracks=tracks,
        total_duration_s=round(total, 3),
        peak_gain_db=round(peak, 2),
        warnings=warnings,
    )