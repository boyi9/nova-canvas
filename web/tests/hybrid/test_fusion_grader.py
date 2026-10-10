"""NC-HYB-06 单元测试：虚实合成与统一调色。

验收标准（执行方案 591-595 行）：
- grade_manifest() 必须跳过 source == "live_action" 的镜头
- measure_delta_e(live, graded_ai) <= 3.0（人像 ≤5.0）——需真实视频，环境无 ffmpeg 时跳过
- 10s/1080p 单片段调色耗时 ≤40 秒——需真实 ffmpeg，跳过
- 调色后片段像素格式 yuv420p，编码 H.264 CRF 16
"""

import os
import shutil
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.hybrid.fusion_grader import (
    GRADE_PRESET, DELTA_E_LIMIT, DELTA_E_PORTRAIT_LIMIT,
    BRIGHTNESS_COMPENSATION, grade_manifest, grade_shot_to_anchor,
)

FFMPEG_AVAILABLE = bool(shutil.which("ffmpeg"))


def _manifest():
    return {"shots": [
        {"shot_id": "S01", "source": "live_action", "start_sec": 0.0, "duration_sec": 3.0},
        {"shot_id": "S02", "source": "ai_generated", "start_sec": 3.0, "duration_sec": 2.0},
        {"shot_id": "S03", "source": "ai_pickup", "start_sec": 5.0, "duration_sec": 2.0},
        {"shot_id": "S04", "source": "stock", "start_sec": 7.0, "duration_sec": 2.0},
        {"shot_id": "S05", "source": "hybrid_composite", "start_sec": 9.0, "duration_sec": 1.0},
    ]}


# ── 1. grade_manifest 跳过实拍 ──────────────────────────────────────
def test_grade_manifest_skips_live_action(monkeypatch, tmp_path):
    graded_calls = []

    def fake_grade(shot_in, anchor, shot_out, **kw):
        graded_calls.append((shot_in, shot_out))
        return shot_out

    monkeypatch.setattr("backend.hybrid.fusion_grader.grade_shot_to_anchor", fake_grade)
    result = grade_manifest(_manifest(), anchor=None, work_dir=str(tmp_path))

    out_ids = {os.path.basename(d).replace("_graded.mp4", "") for _, d in graded_calls}
    assert "S01" not in out_ids, "实拍镜头必须跳过（实拍是色彩基准）"
    assert out_ids == {"S02", "S03", "S04", "S05"}, f"非实拍镜头全部调色: {out_ids}"
    assert len(result) == 4
    # 路径规则：normalized 输入、graded 输出
    src0, dst0 = graded_calls[0]
    assert "normalized/S02.mp4" in src0.replace("\\", "/")
    assert "graded/S02_graded.mp4" in dst0.replace("\\", "/")
    print(f"✓ grade_manifest 跳过实拍，调色 {out_ids}")


# ── 2. 调色预设：CRF16 + yuv420p ───────────────────────────────────
def test_grade_preset():
    assert GRADE_PRESET["crf"] == "16", "必须 H.264 CRF 16"
    assert GRADE_PRESET["pix_fmt"] == "yuv420p", "必须 yuv420p"
    print("✓ 调色预设 CRF16 + yuv420p")


# ── 3. 亮度补偿公式与 ΔE 阈值 ──────────────────────────────────────
def test_compensation_formula():
    # delta_b = (anchor.brightness - st.brightness) * 0.25
    anchor_b, st_b = 0.60, 0.40
    delta_b = (anchor_b - st_b) * BRIGHTNESS_COMPENSATION
    assert abs(delta_b - 0.05) < 1e-9, f"保守系数 0.25: {delta_b}"
    assert DELTA_E_LIMIT == 3.0 and DELTA_E_PORTRAIT_LIMIT == 5.0
    print(f"✓ 亮度补偿系数 0.25 → Δb={delta_b}；ΔE 阈值 {DELTA_E_LIMIT}/{DELTA_E_PORTRAIT_LIMIT}")


# ── 4. 单片段调色命令：lut3d + eq + deshake ─────────────────────────
def test_grade_shot_filter_chain(monkeypatch, tmp_path):
    from backend.hybrid.color_anchor import ColorAnchor
    calls = {}

    def fake_probe(video, at_sec=1.0):
        return {"saturation": 0.3, "brightness": 0.5, "contrast": 50,
                "r_mean": 1, "g_mean": 1, "b_mean": 1, "gray": 1,
                "wb_gain": [1, 1, 1], "top_colors": []}

    def fake_run(cmd, check=True, capture_output=True):
        calls["cmd"] = cmd
        return subprocess.CompletedProcess(args=cmd, returncode=0, stdout=b"", stderr=b"")

    monkeypatch.setattr("backend.hybrid.fusion_grader.probe_video_stats", fake_probe)
    monkeypatch.setattr(subprocess, "run", fake_run)

    anchor = ColorAnchor(anchor_id="CA-1", ref_frame="ref.png", kelvin=5200,
                         wb_gain=[1.1, 1.0, 0.9], brightness=0.6, contrast=50,
                         saturation=0.3)
    out = str(tmp_path / "out" / "S02_graded.mp4")
    grade_shot_to_anchor("in.mp4", anchor, out, lut_dir=str(tmp_path / "lut"))

    vf = calls["cmd"][calls["cmd"].index("-vf") + 1]
    assert "lut3d=" in vf, "① 色彩克隆必须 lut3d"
    assert "eq=brightness=" in vf, "② HSL 微差必须 eq"
    assert "deshake" in vf, "④ 稳运动必须 deshake"
    # 亮度补偿：anchor0.6 - current0.5 = 0.1 * 0.25 = 0.025
    assert "brightness=0.0250" in vf, f"亮度补偿计算错误: {vf}"
    assert calls["cmd"][calls["cmd"].index("-crf") + 1] == "16"
    assert "yuv420p" in calls["cmd"]
    print(f"✓ 调色滤镜链: {vf}")

    # deshake=False 时不含 deshake
    grade_shot_to_anchor("in.mp4", anchor, out, lut_dir=str(tmp_path / "lut"),
                         deshake=False)
    vf2 = calls["cmd"][calls["cmd"].index("-vf") + 1]
    assert "deshake" not in vf2
    print("✓ deshake 可关闭")


# ── 5. 真实 ΔE 测量（需 ffmpeg） ──────────────────────────────────
@pytest.mark.skipif(not FFMPEG_AVAILABLE, reason="环境无 ffmpeg")
def test_measure_delta_e_identical(tmp_path):
    from backend.hybrid.fusion_grader import measure_delta_e
    clips = []
    for i in range(2):
        p = str(tmp_path / f"c{i}.mp4")
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i",
                        "testsrc2=size=320x240:rate=30:duration=2",
                        "-pix_fmt", "yuv420p", p], check=True, capture_output=True)
        clips.append(p)
    d = measure_delta_e(clips[0], clips[1])
    assert d <= DELTA_E_LIMIT, f"同源片段 ΔE 应 ≤3: {d}"
    print(f"✓ measure_delta_e 同源={d:.2f}")


if __name__ == "__main__":
    print("本测试需在 pytest 下运行（依赖 monkeypatch/tmp_path）")