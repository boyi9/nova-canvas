# -*- coding: utf-8 -*-
# file: backend/routers/audio_api.py
# 作用：音频接口 —— 音色/BGM/音效目录、TTS/BGM/SFX 任务规划、混音计划、预算查询
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

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
)

router = APIRouter(prefix="/api/audio", tags=["audio"])


def _job_dict(job) -> Dict[str, Any]:
    return {
        "job_id": job.job_id,
        "kind": job.kind,
        "status": job.status.value,
        "params": job.params,
        "estimated_duration_s": job.estimated_duration_s,
        "estimated_cost_cny": job.estimated_cost_cny,
        "estimated_bytes": job.estimated_bytes,
        "created_at": job.created_at,
    }


class TtsIn(BaseModel):
    text: str
    voice_id: str
    speed: float = 1.0
    volume: float = 1.0
    pitch: float = 0.0


class BgmIn(BaseModel):
    bgm_id: str
    duration_s: float = 30.0
    volume: float = 0.3
    loop: bool = True
    duck_under_voice: bool = True


class SfxIn(BaseModel):
    sfx_id: str
    volume: float = 0.8
    offset_s: float = 0.0


class BatchIn(BaseModel):
    requests: List[Dict[str, Any]] = Field(default_factory=list)


class MixTrackIn(BaseModel):
    track_id: str
    kind: str                       # voice | bgm | sfx
    start_s: float = 0.0
    duration_s: float = 0.0
    gain_db: float = 0.0
    duck_under_voice: bool = False


class MixIn(BaseModel):
    voice: Optional[MixTrackIn] = None
    bgm: Optional[MixTrackIn] = None
    sfx: List[MixTrackIn] = Field(default_factory=list)
    master_ceiling_db: float = -1.0


# ── 目录 ────────────────────────────────────────────────────────────────
@router.get("/catalog", summary="音色 / BGM / 音效目录")
def catalog(
    lang: str = "",
    mood: str = "",
    category: str = "",
) -> Dict[str, Any]:
    return {
        "voices": [
            {
                "id": v.id,
                "name": v.name,
                "gender": v.gender,
                "lang": v.lang,
                "style": v.style,
                "sample_rate": v.sample_rate,
            }
            for v in list_voices(lang)
        ],
        "bgm": [
            {
                "id": b.id,
                "name": b.name,
                "mood": b.mood,
                "bpm": b.bpm,
                "duration_s": b.duration_s,
                "tags": b.tags,
            }
            for b in list_bgm(mood)
        ],
        "sfx": [
            {"id": s.id, "name": s.name, "category": s.category, "duration_s": s.duration_s}
            for s in list_sfx(category)
        ],
    }


# ── 任务规划 ────────────────────────────────────────────────────────────
@router.post("/tts", summary="TTS 语音合成任务规划")
def plan_tts(req: TtsIn) -> Dict[str, Any]:
    try:
        job = get_audio_engine().plan_tts(
            req.text, req.voice_id, speed=req.speed, volume=req.volume, pitch=req.pitch
        )
    except AudioError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _job_dict(job)


@router.post("/bgm", summary="BGM 背景音乐任务规划")
def plan_bgm(req: BgmIn) -> Dict[str, Any]:
    try:
        job = get_audio_engine().plan_bgm(
            req.bgm_id,
            duration_s=req.duration_s,
            volume=req.volume,
            loop=req.loop,
            duck_under_voice=req.duck_under_voice,
        )
    except AudioError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _job_dict(job)


@router.post("/sfx", summary="音效任务规划")
def plan_sfx(req: SfxIn) -> Dict[str, Any]:
    try:
        job = get_audio_engine().plan_sfx(req.sfx_id, volume=req.volume, offset_s=req.offset_s)
    except AudioError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _job_dict(job)


@router.post("/batch", summary="批量音频任务规划（全成功或全回滚）")
def plan_batch(req: BatchIn) -> Dict[str, Any]:
    if not req.requests:
        raise HTTPException(status_code=400, detail="requests 不能为空")
    try:
        jobs = get_audio_engine().plan_batch(req.requests)
    except AudioError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "jobs": [_job_dict(j) for j in jobs],
        "total": len(jobs),
        "total_cost_cny": get_audio_engine().total_cost([j.job_id for j in jobs]),
    }


@router.get("/jobs", summary="音频任务列表")
def list_audio_jobs() -> Dict[str, Any]:
    jobs = get_audio_engine().list_jobs()
    return {"jobs": [_job_dict(j) for j in jobs], "total": len(jobs)}


@router.get("/jobs/{job_id}", summary="音频任务详情")
def get_audio_job(job_id: str) -> Dict[str, Any]:
    job = get_audio_engine().get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return _job_dict(job)


@router.get("/budget", summary="按任务列表汇总预算")
def budget(job_ids: str = "") -> Dict[str, Any]:
    ids = [i for i in job_ids.split(",") if i]
    return {
        "job_ids": ids,
        "total_cost_cny": get_audio_engine().total_cost(ids),
    }


# ── 混音 ────────────────────────────────────────────────────────────────
@router.post("/mix", summary="生成混音计划（含闪避与母线检查）")
def mix(req: MixIn) -> Dict[str, Any]:
    def conv(t: Optional[MixTrackIn]) -> Optional[MixTrack]:
        if t is None:
            return None
        return MixTrack(
            track_id=t.track_id,
            kind=t.kind,
            start_s=t.start_s,
            duration_s=t.duration_s,
            gain_db=t.gain_db,
            duck_under_voice=t.duck_under_voice,
        )

    plan = build_mix_plan(
        conv(req.voice),
        conv(req.bgm),
        [conv(s) for s in req.sfx if s is not None],
        master_ceiling_db=req.master_ceiling_db,
    )
    return {
        "tracks": [
            {
                "track_id": t.track_id,
                "kind": t.kind,
                "start_s": t.start_s,
                "duration_s": t.duration_s,
                "gain_db": t.gain_db,
                "duck_under_voice": t.duck_under_voice,
            }
            for t in plan.tracks
        ],
        "total_duration_s": plan.total_duration_s,
        "peak_gain_db": plan.peak_gain_db,
        "warnings": plan.warnings,
    }


@router.get("/tools/gain", summary="线性音量转 dB")
def gain_tool(volume: float = 1.0) -> Dict[str, Any]:
    return {"volume": volume, "gain_db": normalize_gain(volume)}


@router.get("/tools/atempo", summary="按目标 BPM 计算变速倍率")
def atempo_tool(target_bpm: int = 120, current_bpm: int = 120) -> Dict[str, Any]:
    return {
        "target_bpm": target_bpm,
        "current_bpm": current_bpm,
        "ratio": atempo_ratio(target_bpm, current_bpm),
        "clamped": target_bpm / max(current_bpm, 1) != atempo_ratio(target_bpm, current_bpm),
    }