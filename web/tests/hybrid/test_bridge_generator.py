"""NC-HYB-05 单元测试：AI 补镜与过渡生成。

验收标准（执行方案 544-548 行）：
- extract_frame(v, None, p) 提取的确实是最后一帧（与 ffmpeg -sseof 结果一致）
- 运镜连续性表覆盖至少 8 组组合，("slow_push_in","pull_out") 返回 WARN
- 生成的过渡片段时长误差 ≤ 0.2s
- 端到端需真实 mp4 + 模型（本环境跳过）
"""

import os
import sys
import subprocess

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.hybrid.bridge_generator import (
    BRIDGE_PROMPT, MOTION_CONTINUITY, BridgeRequest, DURATION_TOLERANCE,
    extract_frame, check_motion_continuity, read_end_scale, generate_bridge,
)


# ── 1. 运镜连续性表：≥8 组合 + WARN 判定 ───────────────────────────
def test_motion_continuity_table():
    assert len(MOTION_CONTINUITY) >= 8, f"表需覆盖至少 8 组，实际 {len(MOTION_CONTINUITY)}"
    assert check_motion_continuity("slow_push_in", "pull_out") == "WARN", \
        '("slow_push_in","pull_out") 必须返回 WARN'
    assert check_motion_continuity("pan_left", "pan_right") == "WARN"
    assert check_motion_continuity("slow_push_in", "slow_push_in") == "OK"
    assert check_motion_continuity("pan_left", "pan_left") == "OK"
    assert check_motion_continuity("static", "static") == "OK"
    # 未列出的组合默认 OK
    assert check_motion_continuity("tilt_up", "tilt_down") == "OK"
    print(f"✓ 运镜连续性表 {len(MOTION_CONTINUITY)} 组，WARN 判定正确")


# ── 2. 过渡提示词模板固定 ──────────────────────────────────────────
def test_bridge_prompt_fixed():
    expected = ("镜头匀速平移过渡，背景虚化渐进，主体位置稳定不变，"
                "无闪烁无撕裂，丝滑衔接，保持与前后镜头一致的色调与光照方向")
    assert BRIDGE_PROMPT == expected, "提示词模板不得改动"
    print("✓ 过渡提示词模板与文档一致")


# ── 3. extract_frame：at_sec=None 使用 -sseof 取最后一帧 ──────────
def test_extract_frame_last_frame(monkeypatch):
    calls = {}

    def fake_run(cmd, check=True, capture_output=True):
        calls["cmd"] = cmd
        return subprocess.CompletedProcess(args=cmd, returncode=0, stdout=b"", stderr=b"")

    monkeypatch.setattr(subprocess, "run", fake_run)
    extract_frame("clip.mp4", None, "tmp_frames/last.png")
    cmd = calls["cmd"]
    assert "-sseof" in cmd, f"取最后一帧必须用 -sseof: {cmd}"
    sseof_idx = cmd.index("-sseof")
    assert float(cmd[sseof_idx + 1]) < 0, "sseof 必须为负值"
    assert cmd[-1] == "tmp_frames/last.png"
    print(f"✓ 最后一帧命令: {cmd}")

    extract_frame("clip.mp4", 1.5, "tmp_frames/f15.png")
    cmd2 = calls["cmd"]
    assert "-ss" in cmd2 and "1.5" in cmd2, f"指定秒抽取: {cmd2}"
    print("✓ 指定秒抽取命令正确")


# ── 4. 时长误差常量 ≤ 0.2s ─────────────────────────────────────────
def test_duration_tolerance():
    assert DURATION_TOLERANCE <= 0.2, "时长误差上限必须 ≤ 0.2s"
    assert BridgeRequest(prev_shot="a.mp4", next_shot="b.mp4",
                         out_path="o.mp4").duration == 3.0
    print(f"✓ 时长误差容差 {DURATION_TOLERANCE}s ≤ 0.2s")


# ── 5. read_end_scale：Demo 返回 1.0 ───────────────────────────────
def test_read_end_scale():
    assert read_end_scale("any.mp4") == 1.0
    print("✓ read_end_scale Demo 返回 1.0")


# ── 6. generate_bridge：模型不可用异常含 provider + 原始错误 ──────
def test_generate_bridge_model_unavailable(monkeypatch, tmp_path):
    # 跳过真实 ffmpeg 抽帧：mock extract_frame
    def fake_extract(video, at_sec, out_png):
        return out_png
    monkeypatch.setattr("backend.hybrid.bridge_generator.extract_frame", fake_extract)

    req = BridgeRequest(
        prev_shot="prev.mp4", next_shot="next.mp4",
        out_path=str(tmp_path / "bridge.mp4"))
    try:
        generate_bridge(req)
        assert False, "模型不可用时应抛异常"
    except RuntimeError as e:
        assert "flf2v" in str(e), f"异常需含 provider 名: {e}"
        print(f"✓ generate_bridge 模型不可用异常: {e}")


def test_generate_bridge_unknown_provider():
    req = BridgeRequest(prev_shot="a.mp4", next_shot="b.mp4", out_path="o.mp4")
    with pytest.raises(ValueError, match="unknown bridge provider"):
        generate_bridge(req, provider="magic")
    print("✓ 未知 provider 抛 ValueError")


if __name__ == "__main__":
    print("本测试需在 pytest 下运行（依赖 monkeypatch/tmp_path）")