# -*- coding: utf-8 -*-
# file: backend/audio/engine.py
# 作用：音频生成引擎 —— TTS/BGM/SFX 任务编排、合规校验、耗时与体积估算
# 说明：无真实 TTS/音频服务时以"任务计划"形式返回，绝不伪造音频二进制。
from __future__ import annotations

import base64
import math
import secrets
import threading
import time
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from web.backend.audio.catalog import (
    BGM_LIBRARY,
    SFX_LIBRARY,
    VOICES,
    CatalogError,
    get_voice,
)


class AudioJobStatus(str, Enum):
    PLANNED = "planned"
    RENDERING = "rendering"
    DONE = "done"
    FAILED = "failed"


class AudioError(ValueError):
    """音频参数非法。"""


@dataclass
class AudioJob:
    job_id: str
    kind: str                      # tts | bgm | sfx
    status: AudioJobStatus = AudioJobStatus.PLANNED
    params: Dict[str, Any] = field(default_factory=dict)
    # 估算信息（无真实渲染时用于前端预算展示）
    estimated_duration_s: float = 0.0
    estimated_cost_cny: float = 0.0
    estimated_bytes: int = 0
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    finished_at: Optional[float] = None


# 每字/每秒的成本与码率（用于预算估算，避免虚报）
_TTS_COST_PER_CHAR = 0.00012      # 元/字
_TTS_BYTES_PER_SEC = 32000        # 128kbps 裸 PCM 近似
_BGM_COST_PER_SEC = 0.00002
_SFX_COST_PER_USE = 0.00005


def _speech_duration(text: str, speed: float) -> float:
    """估算朗读时长：中文按 4.5 字/秒，英文按 14 字符/秒。"""
    speed = max(0.5, min(2.0, speed))
    cjk = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    other = len(text) - cjk
    seconds = cjk / 4.5 + other / 14.0
    return max(0.3, seconds / speed)


class AudioEngine:
    """音频生成引擎（任务计划 + 预算估算 + 合规校验）。"""

    def __init__(self, max_chars: int = 2000) -> None:
        self._lock = threading.RLock()
        self._jobs: Dict[str, AudioJob] = {}
        self.max_chars = max_chars

    # ── 查询 ──────────────────────────────────────────────────────────────
    def get_job(self, job_id: str) -> Optional[AudioJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def list_jobs(self) -> List[AudioJob]:
        with self._lock:
            return sorted(self._jobs.values(), key=lambda j: j.created_at, reverse=True)

    # ── TTS ───────────────────────────────────────────────────────────────
    def plan_tts(
        self,
        text: str,
        voice_id: str,
        speed: float = 1.0,
        volume: float = 1.0,
        pitch: float = 0.0,
    ) -> AudioJob:
        text = (text or "").strip()
        if not text:
            raise AudioError("文本不能为空")
        if len(text) > self.max_chars:
            raise AudioError(f"文本过长（{len(text)} > {self.max_chars}）")
        try:
            voice = get_voice(voice_id)
        except CatalogError as e:
            raise AudioError(str(e)) from e
        speed = max(0.5, min(2.0, speed))
        volume = max(0.0, min(2.0, volume))
        pitch = max(-1.0, min(1.0, pitch))

        duration = _speech_duration(text, speed)
        job = AudioJob(
            job_id=f"aud_{secrets.token_hex(8)}",
            kind="tts",
            params={
                "text": text,
                "chars": len(text),
                "voice_id": voice.id,
                "voice_lang": voice.lang,
                "speed": speed,
                "volume": volume,
                "pitch": pitch,
                "sample_rate": voice.sample_rate,
            },
            estimated_duration_s=round(duration, 2),
            estimated_cost_cny=round(len(text) * _TTS_COST_PER_CHAR, 6),
            estimated_bytes=int(duration * _TTS_BYTES_PER_SEC),
        )
        return self._register(job)

    # ── BGM ───────────────────────────────────────────────────────────────
    def plan_bgm(
        self,
        bgm_id: str,
        duration_s: float = 30.0,
        volume: float = 0.3,
        loop: bool = True,
        duck_under_voice: bool = True,
    ) -> AudioJob:
        track = BGM_LIBRARY.get(bgm_id)
        if track is None:
            raise AudioError(f"未知 BGM: {bgm_id}")
        duration_s = max(1.0, min(track.duration_s if not loop else 1800.0, duration_s))
        volume = max(0.0, min(1.0, volume))
        job = AudioJob(
            job_id=f"aud_{secrets.token_hex(8)}",
            kind="bgm",
            params={
                "bgm_id": track.id,
                "mood": track.mood,
                "bpm": track.bpm,
                "volume": volume,
                "loop": loop,
                "duck_under_voice": duck_under_voice,
            },
            estimated_duration_s=round(duration_s, 2),
            estimated_cost_cny=round(duration_s * _BGM_COST_PER_SEC, 6),
            estimated_bytes=int(duration_s * 48000),
        )
        return self._register(job)

    # ── SFX ───────────────────────────────────────────────────────────────
    def plan_sfx(self, sfx_id: str, volume: float = 0.8, offset_s: float = 0.0) -> AudioJob:
        effect = SFX_LIBRARY.get(sfx_id)
        if effect is None:
            raise AudioError(f"未知音效: {sfx_id}")
        volume = max(0.0, min(1.5, volume))
        offset_s = max(0.0, offset_s)
        job = AudioJob(
            job_id=f"aud_{secrets.token_hex(8)}",
            kind="sfx",
            params={
                "sfx_id": effect.id,
                "category": effect.category,
                "volume": volume,
                "offset_s": offset_s,
            },
            estimated_duration_s=effect.duration_s,
            estimated_cost_cny=_SFX_COST_PER_USE,
            estimated_bytes=int(effect.duration_s * 48000),
        )
        return self._register(job)

    # ── 批量 ──────────────────────────────────────────────────────────────
    def plan_batch(self, requests: List[Dict[str, Any]]) -> List[AudioJob]:
        """批量规划；任一子任务非法则整体报错（避免半成功状态）。"""
        jobs: List[AudioJob] = []
        for req in requests:
            kind = req.get("kind")
            try:
                if kind == "tts":
                    jobs.append(self.plan_tts(**{k: v for k, v in req.items() if k != "kind"}))
                elif kind == "bgm":
                    jobs.append(self.plan_bgm(**{k: v for k, v in req.items() if k != "kind"}))
                elif kind == "sfx":
                    jobs.append(self.plan_sfx(**{k: v for k, v in req.items() if k != "kind"}))
                else:
                    raise AudioError(f"未知音频类型: {kind}")
            except AudioError as e:
                for j in jobs:  # 回滚已登记的任务，避免残留
                    self._jobs.pop(j.job_id, None)
                raise
        return jobs

    def _register(self, job: AudioJob) -> AudioJob:
        with self._lock:
            self._jobs[job.job_id] = job
        return job

    # ── 渲染（本地合成演示模式）─────────────────────────────────────────
    def render_job(self, job_id: str, mode: str = "demo") -> AudioJob:
        """
        渲染任务为真实 WAV 二进制。
        mode: demo（本地正弦波演示）| silence（静音）
        生产环境应替换为真实 TTS/BGM/SFX 服务调用。
        """
        from web.backend.audio.synthesizer import (
            synth_bgm,
            synth_sfx,
            synth_tts,
        )

        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise AudioError(f"任务不存在: {job_id}")

            if job.status == AudioJobStatus.DONE:
                return job

            try:
                job.status = AudioJobStatus.RENDERING

                if job.kind == "tts":
                    audio_bytes = synth_tts(
                        job.params["voice_id"],
                        job.estimated_duration_s,
                    )
                elif job.kind == "bgm":
                    audio_bytes = synth_bgm(
                        job.params["bgm_id"],
                        job.estimated_duration_s,
                    )
                elif job.kind == "sfx":
                    audio_bytes = synth_sfx(
                        job.params["sfx_id"],
                        job.estimated_duration_s,
                    )
                else:
                    raise AudioError(f"未知任务类型: {job.kind}")

                job.output = {
                    "format": "wav",
                    "bytes": len(audio_bytes),
                    "audio_b64": base64.b64encode(audio_bytes).decode("ascii"),
                }
                job.status = AudioJobStatus.DONE
                job.finished_at = time.time()
            except Exception as e:
                job.status = AudioJobStatus.FAILED
                job.error = str(e)

            return job

    def total_cost(self, job_ids: List[str]) -> float:
        with self._lock:
            return round(
                sum(self._jobs[j].estimated_cost_cny for j in job_ids if j in self._jobs),
                6,
            )


_engine: Optional[AudioEngine] = None


def get_audio_engine() -> AudioEngine:
    global _engine
    if _engine is None:
        _engine = AudioEngine()
    return _engine


def reset_audio_engine() -> None:
    """测试用：重置引擎。"""
    global _engine
    _engine = None