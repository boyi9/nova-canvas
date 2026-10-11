# -*- coding: utf-8 -*-
# file: backend/audio/synthesizer.py
# 作用：本地音频合成器 —— 无外部 TTS 服务时生成真实 WAV 二进制
# 说明：生成静音/正弦波 WAV，用于验证管线连通性；生产环境替换为真实 TTS 调用。
from __future__ import annotations

import io
import math
import struct
import wave
from typing import Optional, Tuple

# WAV 参数
_SAMPLE_RATE = 24000
_SAMPLE_WIDTH = 2          # 16-bit
_CHANNELS = 1              # mono


def _sine_wave(
    duration_s: float,
    freq_hz: float = 440.0,
    amplitude: float = 0.3,
) -> bytes:
    """生成正弦波 PCM 数据。"""
    n_samples = int(_SAMPLE_RATE * duration_s)
    frames = bytearray()
    for i in range(n_samples):
        t = i / _SAMPLE_RATE
        value = amplitude * math.sin(2 * math.pi * freq_hz * t)
        # 16-bit PCM: [-32768, 32767]
        pcm = int(value * 32767)
        frames.extend(struct.pack("<h", pcm))
    return bytes(frames)


def _silence(duration_s: float) -> bytes:
    """生成静音 PCM 数据。"""
    n_samples = int(_SAMPLE_RATE * duration_s)
    return b"\x00\x00" * n_samples


def _fade(pcm: bytes, fade_ms: int = 50) -> bytes:
    """对 PCM 数据加淡入淡出，避免爆音。"""
    n_samples = len(pcm) // _SAMPLE_WIDTH
    fade_samples = min(n_samples // 4, int(_SAMPLE_RATE * fade_ms / 1000))
    if fade_samples <= 0:
        return pcm

    data = bytearray(pcm)
    # 淡入
    for i in range(fade_samples):
        factor = i / fade_samples
        offset = i * _SAMPLE_WIDTH
        sample = struct.unpack_from("<h", data, offset)[0]
        struct.pack_into("<h", data, offset, int(sample * factor))
    # 淡出
    for i in range(fade_samples):
        factor = 1.0 - (i / fade_samples)
        offset = (n_samples - fade_samples + i) * _SAMPLE_WIDTH
        sample = struct.unpack_from("<h", data, offset)[0]
        struct.pack_into("<h", data, offset, int(sample * factor))
    return bytes(data)


def synthesize_wav(
    duration_s: float,
    mode: str = "silence",
    freq_hz: float = 440.0,
    amplitude: float = 0.3,
) -> bytes:
    """
    合成 WAV 二进制。
    mode: silence | sine | fade_sine
    """
    duration_s = max(0.1, min(duration_s, 600.0))

    if mode == "silence":
        pcm = _silence(duration_s)
    elif mode == "sine":
        pcm = _sine_wave(duration_s, freq_hz, amplitude)
    elif mode == "fade_sine":
        pcm = _fade(_sine_wave(duration_s, freq_hz, amplitude))
    else:
        pcm = _silence(duration_s)

    # 写 WAV
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(_CHANNELS)
        wf.setsampwidth(_SAMPLE_WIDTH)
        wf.setframerate(_SAMPLE_RATE)
        wf.writeframes(pcm)
    return buf.getvalue()


def wav_info(wav_bytes: bytes) -> dict:
    """解析 WAV 元信息。"""
    try:
        buf = io.BytesIO(wav_bytes)
        with wave.open(buf, "rb") as wf:
            return {
                "channels": wf.getnchannels(),
                "sample_width": wf.getsampwidth(),
                "sample_rate": wf.getframerate(),
                "frames": wf.getnframes(),
                "duration_s": round(wf.getnframes() / wf.getframerate(), 3),
                "bytes": len(wav_bytes),
            }
    except Exception:
        return {"error": "invalid wav"}


# 音色频率映射（用于演示）
VOICE_FREQ_MAP = {
    "zh_female_warm": 220.0,
    "zh_female_bright": 280.0,
    "zh_male_steady": 160.0,
    "zh_male_young": 200.0,
    "en_female_neutral": 240.0,
    "en_male_neutral": 180.0,
    "ja_female_neutral": 230.0,
}

# BGM 基调频率映射
BGM_FREQ_MAP = {
    "bgm_upbeat_pop": 523.0,       # C5
    "bgm_warm_acoustic": 392.0,    # G4
    "bgm_epic_cinematic": 261.0,   # C4
    "bgm_tense_suspense": 311.0,   # Eb4
    "bgm_lofi_chill": 349.0,       # F4
    "bgm_energetic_sport": 587.0,  # D5
}

# SFX 频率映射
SFX_FREQ_MAP = {
    "sfx_whoosh_light": 800.0,
    "sfx_whoosh_heavy": 400.0,
    "sfx_impact_hit": 150.0,
    "sfx_impact_pop": 600.0,
    "sfx_ui_click": 1000.0,
    "sfx_ui_success": 880.0,
    "sfx_ui_error": 220.0,
    "sfx_nature_rain": 300.0,
    "sfx_crowd_cheer": 440.0,
}


def synth_tts(voice_id: str, duration_s: float) -> bytes:
    """按音色合成 TTS 音频（演示模式：正弦波）。"""
    freq = VOICE_FREQ_MAP.get(voice_id, 440.0)
    return synthesize_wav(duration_s, mode="fade_sine", freq_hz=freq, amplitude=0.2)


def synth_bgm(bgm_id: str, duration_s: float) -> bytes:
    """按 BGM 合成背景音乐（演示模式：低频正弦波）。"""
    freq = BGM_FREQ_MAP.get(bgm_id, 440.0)
    return synthesize_wav(duration_s, mode="sine", freq_hz=freq, amplitude=0.15)


def synth_sfx(sfx_id: str, duration_s: float) -> bytes:
    """按音效合成音效（演示模式：高频正弦波）。"""
    freq = SFX_FREQ_MAP.get(sfx_id, 440.0)
    return synthesize_wav(duration_s, mode="fade_sine", freq_hz=freq, amplitude=0.4)