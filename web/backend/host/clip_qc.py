"""线下素材回传自动质检：8 项指标 + pass/warn/reject 三态判定。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional

from .qc_config import (
    THRESHOLDS,
    SCORING,
    VERDICT_RULES,
    get_threshold,
    get_scoring_weights,
    get_verdict_boundaries,
)


@dataclass
class QCResult:
    """质检结果。"""
    verdict: str                 # pass / warn / reject
    score: int                   # 0-100
    issues: List[str] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)


def _deduct(score: int, penalty: int) -> int:
    return max(0, score + penalty)  # penalty 是负数


def qc_clip(
    meta: Dict[str, Any],
    baseline: Dict[str, Any],
    thresholds_override: Optional[Dict[str, Any]] = None,
) -> QCResult:
    """
    对单个素材进行质检。

    Args:
        meta: 素材实测值
            - width, height: 分辨率
            - fps: 帧率
            - duration_sec: 时长
            - mean_luma: 平均亮度 (0-255)
            - wb_kelvin: 白平衡色温
            - laplacian_var: 拉普拉斯方差（锐度）
            - shake_pct: 抖动百分比
            - noise_dbfs: 底噪
            - clipped: 是否削波
        baseline: 项目基准
            - fps, duration_sec, wb_kelvin, orientation
        thresholds_override: 可选，覆盖默认阈值

    Returns:
        QCResult 包含 verdict/score/issues/suggestions
    """
    th = thresholds_override or THRESHOLDS
    issues = []
    suggestions = []
    details = {}
    score = SCORING.get("base_score", 100)

    # 1) 分辨率
    long_edge = max(meta.get("width", 0), meta.get("height", 0))
    res_th = get_threshold("resolution")
    min_edge = res_th.get("min_long_edge", 1080)
    if long_edge < min_edge:
        issues.append(f"分辨率不足：长边 {long_edge} < {min_edge}")
        suggestions.append("请用 1080p 及以上重拍")
        score = _deduct(score, SCORING["penalties"].get("resolution_insufficient", -40))
    details["resolution"] = {"long_edge": long_edge, "required": min_edge}

    # 2) 帧率
    fr_th = get_threshold("framerate")
    max_diff = fr_th.get("max_diff_fps", 1)
    if abs(meta.get("fps", 0) - baseline.get("fps", 0)) > max_diff:
        issues.append(f"帧率不一致：{meta.get('fps')} vs 基准 {baseline.get('fps')}")
        suggestions.append("可自动转码，但建议统一拍摄帧率")
        score = _deduct(score, SCORING["penalties"].get("framerate_mismatch", -10))
    details["framerate"] = {"actual": meta.get("fps"), "baseline": baseline.get("fps")}

    # 3) 时长
    dur_th = get_threshold("duration")
    base_dur = baseline.get("duration_sec", 0)
    if base_dur > 0:
        dev = abs(meta.get("duration_sec", 0) - base_dur) / base_dur
        if dev > dur_th.get("reject_dev_pct", 0.5):
            issues.append(f"时长偏差过大：{dev:.0%}（基准 {base_dur}s）")
            suggestions.append("请按分镜时长重拍")
            score = _deduct(score, SCORING["penalties"].get("duration_reject", -30))
        elif dev > dur_th.get("max_dev_pct", 0.15):
            issues.append(f"时长偏差 {dev:.0%}，后期需修剪")
            score = _deduct(score, SCORING["penalties"].get("duration_warn", -8))
    details["duration"] = {"actual": meta.get("duration_sec"), "baseline": base_dur}

    # 4) 曝光
    exp_th = get_threshold("exposure")
    mean_luma = meta.get("mean_luma", 128)
    if not (exp_th.get("mean_luma_min", 70) <= mean_luma <= exp_th.get("mean_luma_max", 200)):
        issues.append(f"曝光异常：平均亮度 {mean_luma}")
        suggestions.append("调整曝光或补光（建议均值 100-160）")
        score = _deduct(score, SCORING["penalties"].get("exposure_abnormal", -20))
    details["exposure"] = {"mean_luma": mean_luma}

    # 5) 白平衡
    wb_th = get_threshold("white_balance")
    wb_dev = abs(meta.get("wb_kelvin", 5600) - baseline.get("wb_kelvin", 5600))
    if wb_dev > wb_th.get("max_kelvin_dev", 800):
        issues.append(f"白平衡偏差 {wb_dev}K")
        suggestions.append("可自动校正，建议拍摄时锁定白平衡")
        score = _deduct(score, SCORING["penalties"].get("wb_deviation", -15))
    details["white_balance"] = {"deviation_k": wb_dev}

    # 6) 清晰度
    sharp_th = get_threshold("sharpness")
    lap_var = meta.get("laplacian_var", 0)
    if lap_var < sharp_th.get("min_laplacian_var", 80):
        issues.append(f"画面不清晰：锐度 {lap_var} < {sharp_th.get('min_laplacian_var', 80)}")
        suggestions.append("请稳定拍摄并确认对焦")
        score = _deduct(score, SCORING["penalties"].get("sharpness_low", -25))
    details["sharpness"] = {"laplacian_var": lap_var}

    # 7) 抖动
    shake_th = get_threshold("shake")
    shake = meta.get("shake_pct", 0)
    if shake > shake_th.get("max_pct", 2.0):
        issues.append(f"画面抖动：位移 {shake:.1f}% > {shake_th.get('max_pct', 2.0)}%")
        suggestions.append("请使用稳定器或固定机位")
        score = _deduct(score, SCORING["penalties"].get("shake_high", -20))
    details["shake"] = {"shake_pct": shake}

    # 8) 声音
    aud_th = get_threshold("audio")
    if meta.get("clipped", False):
        issues.append("音频削波（爆音）")
        suggestions.append("请降低录音电平重录")
        score = _deduct(score, SCORING["penalties"].get("audio_clipped", -15))
    noise = meta.get("noise_dbfs", -60)
    if noise > aud_th.get("max_noise_dbfs", -45):
        issues.append(f"底噪偏高：{noise} dBFS > {aud_th.get('max_noise_dbfs', -45)}")
        suggestions.append("关闭环境噪声源或后期降噪")
        score = _deduct(score, SCORING["penalties"].get("audio_noise_high", -10))
    details["audio"] = {"noise_dbfs": noise, "clipped": meta.get("clipped", False)}

    score = max(0, min(100, score))

    # 三态判定
    bounds = get_verdict_boundaries()
    if score >= bounds["pass_min"]:
        verdict = "pass"
    elif score >= bounds["warn_min"]:
        verdict = "warn"
    else:
        verdict = "reject"

    return QCResult(
        verdict=verdict,
        score=score,
        issues=issues,
        suggestions=suggestions,
        details=details,
    )


def qc_batch(
    clips: List[Dict[str, Any]],
    baseline: Dict[str, Any],
) -> List[QCResult]:
    """批量质检。"""
    return [qc_clip(meta, baseline) for meta in clips]


def verdict_to_handoff_action(verdict: str) -> str:
    """将质检结论映射为接缝任务动作。"""
    return {
        "pass": "validated",
        "warn": "validated_with_warning",
        "reject": "rejected",
    }.get(verdict, "rejected")


if __name__ == "__main__":
    # Demo 测试
    baseline = {
        "fps": 60,
        "duration_sec": 3.0,
        "wb_kelvin": 5600,
    }

    # 合格样本
    good = {
        "width": 1080, "height": 1920,
        "fps": 60, "duration_sec": 3.1,
        "mean_luma": 130, "wb_kelvin": 5500,
        "laplacian_var": 120, "shake_pct": 0.8,
        "noise_dbfs": -50, "clipped": False,
    }
    print("=== 合格样本 ===")
    r = qc_clip(good, baseline)
    print(f"verdict: {r.verdict}, score: {r.score}")
    print(f"issues: {r.issues}")

    # 严重问题样本
    bad = {
        "width": 720, "height": 1280,
        "fps": 30, "duration_sec": 1.0,
        "mean_luma": 50, "wb_kelvin": 7000,
        "laplacian_var": 30, "shake_pct": 5.0,
        "noise_dbfs": -30, "clipped": True,
    }
    print("\n=== 严重问题样本 ===")
    r = qc_clip(bad, baseline)
    print(f"verdict: {r.verdict}, score: {r.score}")
    print(f"issues: {r.issues}")
    print(f"suggestions: {r.suggestions}")