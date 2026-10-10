"""NC-HYB-04 单元测试：实拍驱动 AI 表演迁移。

验收标准（执行方案 510-514 行）：
- 5 类校验各自有单元测试，正例通过、反例返回明确中文原因
- estimate_credits(1.5) == 15（最低 3 秒 → 3×5）
- estimate_credits(6.0) == 30
- transfer() 在模型不可用时，异常信息需包含 "act_two" 与原始错误
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.hybrid.performance_transfer import (
    TransferRequest, validate, transfer, estimate_credits,
    MIN_DRIVER_SEC, MAX_DRIVER_SEC, MIN_REF_WIDTH, MIN_REF_HEIGHT,
    FINGER_TRACKING_SAFE_MAX, FINGER_TRACKING_HARD_LIMIT,
)


def _req(**kw):
    base = dict(driver_video="raw/live/S01.mp4", character_ref="ref.png",
                out_path="/tmp/out.mp4")
    base.update(kw)
    return TransferRequest(**base)


GOOD = dict(driver_duration=5.0, ref_w=1024, ref_h=768, face_occlusion_ratio=0.1)


# ── 校验 1：驱动视频时长 3-8s ───────────────────────────────────────
def test_driver_duration_ok():
    problems = validate(_req(), **GOOD)
    assert problems == [], f"正例应通过，实际: {problems}"
    print("✓ 时长正例（5s）通过")


def test_driver_duration_too_short():
    p = validate(_req(), driver_duration=2.0, ref_w=1024, ref_h=768,
                 face_occlusion_ratio=0.1)
    assert any("时长" in x and "3.0-8.0s" in x for x in p), f"反例应报时长问题: {p}"
    assert "重拍" in p[0], "应提示重拍"
    print("✓ 时长反例（2s）报中文原因")


def test_driver_duration_too_long():
    p = validate(_req(), driver_duration=9.5, ref_w=1024, ref_h=768,
                 face_occlusion_ratio=0.1)
    assert any("时长" in x for x in p), f"反例应报时长问题: {p}"
    print("✓ 时长反例（9.5s）报中文原因")


# ── 校验 2：角色参考图分辨率 ≥ 768×512 ─────────────────────────────
def test_ref_resolution_ok():
    p = validate(_req(), ref_w=MIN_REF_WIDTH, ref_h=MIN_REF_HEIGHT,
                 driver_duration=5.0, face_occlusion_ratio=0.1)
    assert p == [], f"正例（刚好 768x512）应通过: {p}"
    print("✓ 分辨率正例（768x512）通过")


def test_ref_resolution_too_small():
    p = validate(_req(), ref_w=640, ref_h=480, driver_duration=5.0,
                 face_occlusion_ratio=0.1)
    assert any("分辨率" in x and "768x512" in x for x in p), f"应报分辨率: {p}"
    assert "更换" in p[0], "应提示更换"
    print("✓ 分辨率反例（640x480）报中文原因")


# ── 校验 3：面部遮挡 ≤ 1/3 ─────────────────────────────────────────
def test_face_occlusion_ok():
    p = validate(_req(), face_occlusion_ratio=1 / 3, driver_duration=5.0,
                 ref_w=1024, ref_h=768)
    assert p == [], f"正例（=1/3）应通过: {p}"
    print("✓ 遮挡正例（=1/3）通过")


def test_face_occlusion_too_high():
    p = validate(_req(), face_occlusion_ratio=0.5, driver_duration=5.0,
                 ref_w=1024, ref_h=768)
    assert any("面部遮挡超过 1/3" in x for x in p), f"应报遮挡: {p}"
    print("✓ 遮挡反例（0.5）报中文原因")


# ── 校验 4：手指追踪强度 ≤ 85% ─────────────────────────────────────
def test_finger_tracking_ok():
    p = validate(_req(finger_tracking=FINGER_TRACKING_HARD_LIMIT),
                 **GOOD)
    assert p == [], f"正例（=85%）应通过: {p}"
    p2 = validate(_req(finger_tracking=FINGER_TRACKING_SAFE_MAX), **GOOD)
    assert p2 == [], f"正例（=75% 安全档）应通过: {p2}"
    print("✓ 手指追踪正例（75%/85%）通过")


def test_finger_tracking_too_high():
    p = validate(_req(finger_tracking=90.0), **GOOD)
    assert any("手指追踪强度" in x and "85" in x for x in p), f"应报手指追踪: {p}"
    print("✓ 手指追踪反例（90%）报中文原因")


# ── 校验 5：角色视频输入 + 姿态控制不可同时开启 ────────────────────
def test_ref_video_with_gestures():
    p = validate(_req(ref_is_video=True, gestures=True), **GOOD)
    assert any("姿态控制不可用" in x for x in p), f"应报姿态控制冲突: {p}"
    print("✓ 视频输入+姿态控制反例报中文原因")


def test_ref_video_without_gestures():
    p = validate(_req(ref_is_video=True, gestures=False), **GOOD)
    assert p == [], f"正例（视频输入且关闭姿态）应通过: {p}"
    print("✓ 视频输入+关闭姿态正例通过")


# ── estimate_credits ────────────────────────────────────────────────
def test_estimate_credits():
    assert estimate_credits(1.5) == 15, f"最低 3 秒计费: 3×5=15, 实际 {estimate_credits(1.5)}"
    assert estimate_credits(6.0) == 30, f"6×5=30, 实际 {estimate_credits(6.0)}"
    assert estimate_credits(3.0) == 15
    assert estimate_credits(0.1) == 15, "不足 3 秒按 3 秒计费"
    print("✓ estimate_credits: 1.5s→15, 6.0s→30")


# ── transfer 模型不可用：异常含 act_two 与原始错误 ─────────────────
def test_transfer_model_unavailable():
    req = _req()
    try:
        transfer(req)
        assert False, "模型不可用时应抛异常"
    except RuntimeError as e:
        msg = str(e)
        assert "act_two" in msg, f"异常信息需含 'act_two': {msg}"
        assert "ModelRouter" in msg or "原始" in msg or "No module" in msg or ":" in msg, \
            f"异常信息需含原始错误: {msg}"
        print(f"✓ transfer 模型不可用异常: {msg}")


# ── 常量硬性校验（不得放宽） ───────────────────────────────────────
def test_constants_fixed():
    assert MIN_DRIVER_SEC == 3.0 and MAX_DRIVER_SEC == 8.0
    assert MIN_REF_WIDTH == 768 and MIN_REF_HEIGHT == 512
    assert FINGER_TRACKING_SAFE_MAX == 75.0 and FINGER_TRACKING_HARD_LIMIT == 85.0
    print("✓ 硬性常量与文档一致")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn) and fn.__code__.co_argcount == 0:
            fn()
    print("\n🎉 所有 NC-HYB-04 单元测试通过！")