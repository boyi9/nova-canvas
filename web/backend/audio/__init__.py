# -*- coding: utf-8 -*-
# file: backend/audio/__init__.py
# 作用：音频生成域 —— TTS 语音合成 / BGM 背景音乐 / SFX 音效
from __future__ import annotations

from .catalog import (
    BGM_LIBRARY,
    SFX_LIBRARY,
    VOICES,
    VoiceDef,
    BgmDef,
    SfxDef,
    get_voice,
    list_voices,
    list_bgm,
    list_sfx,
)
from .engine import (
    AudioError,
    AudioJob,
    AudioJobStatus,
    AudioEngine,
    get_audio_engine,
    reset_audio_engine,
)

from .synthesizer import (
    synth_tts,
    synth_bgm,
    synth_sfx,
    synthesize_wav,
    wav_info,
)
from .mixer import (
    MixPlan,
    MixTrack,
    build_mix_plan,
    normalize_gain,
    atempo_ratio,
)

__all__ = [
    "BGM_LIBRARY",
    "SFX_LIBRARY",
    "VOICES",
    "VoiceDef",
    "BgmDef",
    "SfxDef",
    "get_voice",
    "list_voices",
    "list_bgm",
    "list_sfx",
    "AudioJob",
    "AudioJobStatus",
    "AudioError",
    "AudioEngine",
    "get_audio_engine",
    "reset_audio_engine",
    "synth_tts",
    "synth_bgm",
    "synth_sfx",
    "synthesize_wav",
    "wav_info",
    "MixPlan",
    "MixTrack",
    "build_mix_plan",
    "normalize_gain",
    "atempo_ratio",
]