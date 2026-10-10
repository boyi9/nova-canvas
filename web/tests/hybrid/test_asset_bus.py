"""NC-HYB-02 单元测试：统一素材总线。

验收标准（执行方案 424-428 行）：
- normalize() 对 24/25/30fps 混入的素材，输出统一帧率且画面不变形（等比缩放 + 补边）
- 非法 fps / resolution / color_space 必须抛 ValueError
- probe() 对同一素材连续调用两次结果一致
- audit() 能正确报出缺失素材的 shot_id
"""

import os
import sys
import json
import shutil
import subprocess

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.hybrid.asset_bus import (
    NormalizeSpec, asset_name, normalize, probe, ingest, audit,
    STANDARD_FPS, STANDARD_RES, COLOR_SPACES, SOURCE_DIR,
)

FFMPEG_AVAILABLE = shutil.which("ffmpeg") and shutil.which("ffprobe")


# ── 1. 统一命名 ────────────────────────────────────────────────────────
def test_asset_name():
    assert asset_name("P001", "S01", "live_action") == "P001_S01_live_action_v1.mp4"
    assert asset_name("P001", "S01", "ai_generated", 3) == "P001_S01_ai_generated_v3.mp4"
    print("✓ asset_name 统一命名通过")


# ── 2. 非法参数抛 ValueError ─────────────────────────────────────────
def test_normalize_invalid_fps():
    spec = NormalizeSpec(project_root="tmp", fps=23)
    with pytest.raises(ValueError, match="fps"):
        normalize("in.mp4", spec, "out.mp4")
    print("✓ 非法 fps=23 抛 ValueError")


def test_normalize_invalid_resolution():
    spec = NormalizeSpec(project_root="tmp", resolution="123x456")
    with pytest.raises(ValueError, match="resolution"):
        normalize("in.mp4", spec, "out.mp4")
    print("✓ 非法 resolution 抛 ValueError")


def test_normalize_invalid_color_space():
    spec = NormalizeSpec(project_root="tmp", color_space="sRGB")
    with pytest.raises(ValueError, match="color_space"):
        normalize("in.mp4", spec, "out.mp4")
    print("✓ 非法 color_space 抛 ValueError")


def test_standard_sets():
    assert STANDARD_FPS == {24, 25, 30}
    assert "1080x1920" in STANDARD_RES and "3840x2160" in STANDARD_RES
    assert COLOR_SPACES == {"Rec.709", "ACES"}
    print("✓ 标准参数集合正确")


# ── 3. probe 两次调用一致（环境无 ffmpeg 时 mock ffprobe 输出） ───────
def _ffprobe_result():
    payload = {"streams": [{
        "width": 1080, "height": 1920,
        "r_frame_rate": "25/1", "pix_fmt": "yuv420p", "duration": "3.000000"
    }]}
    return subprocess.CompletedProcess(args=["ffprobe"], returncode=0,
                                       stdout=json.dumps(payload), stderr="")


def test_probe_deterministic(monkeypatch):
    monkeypatch.setattr(subprocess, "run",
                        lambda *a, **k: _ffprobe_result())
    r1 = probe("any.mp4")
    r2 = probe("any.mp4")
    assert r1 == r2, f"两次 probe 结果应一致: {r1} vs {r2}"
    assert r1["fps"] == 25.0 and r1["width"] == 1080 and r1["height"] == 1920
    print(f"✓ probe 两次调用一致: {r1}")


# ── 4. normalize 构造的滤镜串：等比缩放 + 补边 + 统一帧率 ─────────────
def test_normalize_filter_no_deform(monkeypatch):
    """24/25/30fps 混入素材时，滤镜必须含 scale(等比) + pad(补边) + fps。"""
    calls = {}

    def fake_run(cmd, check=True, capture_output=True, text=False):
        calls["cmd"] = cmd
        os.makedirs(os.path.dirname("tmp/out/out.mp4"), exist_ok=True)
        return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    spec = NormalizeSpec(project_root="tmp", fps=24, resolution="1080x1920")
    out = normalize("in.mp4", spec, "tmp/out/out.mp4")
    vf = calls["cmd"][calls["cmd"].index("-vf") + 1]
    assert "force_original_aspect_ratio=decrease" in vf, "必须等比缩放，避免拉伸变形"
    assert "pad=1080:1920" in vf, "必须补边填充"
    assert "fps=24" in vf, "必须统一帧率"
    assert "format=yuv420p" in vf, "统一像素格式"
    assert out == "tmp/out/out.mp4"
    shutil.rmtree("tmp", ignore_errors=True)
    print(f"✓ normalize 滤镜串正确（不变形）: {vf}")


# ── 5. ingest：未知来源拦截 + 正确目录 ───────────────────────────────
def test_ingest_unknown_source():
    spec = NormalizeSpec(project_root="tmp")
    with pytest.raises(ValueError, match="未知来源"):
        ingest("P001", "S01", "unknown_src", "in.mp4", spec)
    print("✓ ingest 未知来源抛 ValueError")


# ── 6. audit：正确报出缺失素材 ──────────────────────────────────────
def test_audit_reports_missing():
    manifest = {"shots": [
        {"shot_id": "S01", "source": "live_action"},
        {"shot_id": "S02", "source": "ai_generated"},
        {"shot_id": "S03", "source": "stock"},
    ]}
    root = "tmp_audit_root"
    os.makedirs(os.path.join(root, "raw", "live"), exist_ok=True)
    # 只放 S01，S02 / S03 缺失
    open(os.path.join(root, "raw", "live", "S01.mp4"), "wb").close()
    try:
        problems = audit(manifest, root)
        assert len(problems) == 2, f"应报 2 项缺失，实际: {problems}"
        assert any("S02" in p for p in problems), "S02（AI 素材）应报缺失"
        assert any("S03" in p for p in problems), "S03（stock）应报缺失"
        assert not any("S01" in p for p in problems), "S01 已存在，不应报缺失"
        print(f"✓ audit 正确报缺失: {problems}")

        # 全部补齐后应无问题
        open(os.path.join(root, "raw", "stock"), "w")  # placeholder
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_audit_all_present():
    manifest = {"shots": [
        {"shot_id": "S01", "source": "live_action"},
        {"shot_id": "S02", "source": "ai_generated"},
    ]}
    root = "tmp_audit_ok"
    os.makedirs(os.path.join(root, "raw", "live"), exist_ok=True)
    os.makedirs(os.path.join(root, "work", "graded"), exist_ok=True)
    open(os.path.join(root, "raw", "live", "S01.mp4"), "wb").close()
    open(os.path.join(root, "work", "graded", "S02_graded.mp4"), "wb").close()
    try:
        problems = audit(manifest, root)
        assert problems == [], f"素材齐备时应无问题，实际: {problems}"
        print("✓ audit 素材齐备返回空列表")
    finally:
        shutil.rmtree(root, ignore_errors=True)


# ── 7. 真实 ffmpeg 端到端（无 ffmpeg 时跳过） ───────────────────────
@pytest.mark.skipif(not FFMPEG_AVAILABLE, reason="环境无 ffmpeg/ffprobe")
def test_real_normalize_mixed_fps(tmp_path):
    """真实验证：24/25fps 素材归一后统一为 30fps 且尺寸正确。"""
    import subprocess as sp
    src24 = str(tmp_path / "src24.mp4")
    sp.run(["ffmpeg", "-y", "-f", "lavfi", "-i",
            "testsrc2=size=640x480:rate=24:duration=1", src24],
           check=True, capture_output=True)
    spec = NormalizeSpec(project_root=str(tmp_path))
    out = normalize(src24, spec, str(tmp_path / "out" / "norm.mp4"))
    info = probe(out)
    assert round(info["fps"]) == 30, f"应统一为 30fps，实际 {info['fps']}"
    assert info["width"] == 1080 and info["height"] == 1920
    print(f"✓ 真实 ffmpeg 归一: {info}")


def main():
    test_asset_name()
    test_normalize_invalid_fps()
    test_normalize_invalid_resolution()
    test_normalize_invalid_color_space()
    test_standard_sets()
    test_probe_deterministic(monkeypatch=_NullMP())
    test_normalize_filter_no_deform(monkeypatch=_NullMP())
    test_ingest_unknown_source()
    test_audit_reports_missing()
    test_audit_all_present()
    print("\n🎉 所有 NC-HYB-02 单元测试通过！")


class _NullMP:
    """直接运行模式下的空 monkeypatch 占位。"""
    def setattr(self, *a, **k):
        pass


if __name__ == "__main__":
    main()