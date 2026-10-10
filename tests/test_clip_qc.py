"""素材质检测试。"""
import pytest
from web.backend.host.clip_qc import qc_clip, qc_batch, verdict_to_handoff_action


def test_qc_pass():
    """合格样本判 pass。"""
    baseline = {"fps": 60, "duration_sec": 3.0, "wb_kelvin": 5600}
    good = {
        "width": 1080, "height": 1920,
        "fps": 60, "duration_sec": 3.1,
        "mean_luma": 130, "wb_kelvin": 5500,
        "laplacian_var": 120, "shake_pct": 0.8,
        "noise_dbfs": -50, "clipped": False,
    }
    r = qc_clip(good, baseline)
    assert r.verdict == "pass"
    assert r.score >= 85
    assert len(r.issues) == 0


def test_qc_reject():
    """严重问题样本判 reject。"""
    baseline = {"fps": 60, "duration_sec": 3.0, "wb_kelvin": 5600}
    bad = {
        "width": 720, "height": 1280,
        "fps": 30, "duration_sec": 1.0,
        "mean_luma": 50, "wb_kelvin": 7000,
        "laplacian_var": 30, "shake_pct": 5.0,
        "noise_dbfs": -30, "clipped": True,
    }
    r = qc_clip(bad, baseline)
    assert r.verdict == "reject"
    assert r.score < 60
    assert len(r.issues) >= 5
    assert len(r.suggestions) >= 5


def test_qc_warn():
    """轻微问题判 warn：需要组合多个轻微问题才能降到 warn。"""
    baseline = {"fps": 60, "duration_sec": 3.0, "wb_kelvin": 5600}
    # 组合：时长偏差 16% + 白平衡偏差 800K + 抖动 1.5% + 底噪 -48
    warn = {
        "width": 1080, "height": 1920,
        "fps": 60, "duration_sec": 3.5,  # 偏差 ~16%
        "mean_luma": 130, "wb_kelvin": 6500,  # 偏差 900K
        "laplacian_var": 100, "shake_pct": 1.5,
        "noise_dbfs": -48, "clipped": False,
    }
    r = qc_clip(warn, baseline)
    assert r.verdict == "warn"
    assert 60 <= r.score < 85


def test_qc_duration_reject():
    """时长偏差过大 + 其他问题组合判 reject。"""
    baseline = {"fps": 60, "duration_sec": 3.0, "wb_kelvin": 5600}
    # 组合：时长偏差 67% + 分辨率不足(480p) + 帧率不一致 + 曝光异常
    bad_dur = {
        "width": 480, "height": 854,  # 分辨率不足 (<1080)
        "fps": 30, "duration_sec": 1.0,  # 偏差 67% + 帧率不一致
        "mean_luma": 50, "wb_kelvin": 5500,  # 曝光异常
        "laplacian_var": 120, "shake_pct": 0.8,
        "noise_dbfs": -50, "clipped": False,
    }
    r = qc_clip(bad_dur, baseline)
    assert r.verdict == "reject"


def test_qc_batch():
    """批量质检。"""
    baseline = {"fps": 60, "duration_sec": 3.0, "wb_kelvin": 5600}
    clips = [
        {"width": 1080, "height": 1920, "fps": 60, "duration_sec": 3.0,
         "mean_luma": 130, "wb_kelvin": 5500, "laplacian_var": 120,
         "shake_pct": 0.8, "noise_dbfs": -50, "clipped": False},
        {"width": 720, "height": 1280, "fps": 30, "duration_sec": 1.0,
         "mean_luma": 50, "wb_kelvin": 7000, "laplacian_var": 30,
         "shake_pct": 5.0, "noise_dbfs": -30, "clipped": True},
    ]
    results = qc_batch(clips, baseline)
    assert len(results) == 2
    assert results[0].verdict == "pass"
    assert results[1].verdict == "reject"


def test_verdict_to_action():
    """verdict 映射到接缝动作。"""
    assert verdict_to_handoff_action("pass") == "validated"
    assert verdict_to_handoff_action("warn") == "validated_with_warning"
    assert verdict_to_handoff_action("reject") == "rejected"
    assert verdict_to_handoff_action("unknown") == "rejected"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])