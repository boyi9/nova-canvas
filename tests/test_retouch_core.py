# -*- coding: utf-8 -*-
# file: tests/test_retouch_core.py
# 作用：NC-RET-03/06 核心算法实测（附录 A/B 指标复验）
import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFilter

from web.backend.retouch.core.frequency import (
    blemish_remove,
    frequency_split,
    lowfreq_variance,
    neutral_grey_retouch,
    skin_mask,
    spot_contrast,
    texture_energy,
)
from web.backend.retouch.core.qc import qc_retouch


def make_synthetic_portrait(size=256, spot=True):
    """合成人像：肤色底 + 中频肤色不均 + 细粒纹理 + 可选高频斑点。"""
    rng = np.random.default_rng(42)
    arr = np.zeros((size, size, 3), dtype=np.float32)
    arr[..., 0] = 200.0
    arr[..., 1] = 160.0
    arr[..., 2] = 140.0
    # 中频肤色不均（波长 ~50px 的斑块，频率分离可压）
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    grad = 16.0 * np.sin(xx / 9.0) + 10.0 * np.cos(yy / 11.0)
    arr += grad[..., None]
    # 细粒纹理（真实皮肤级噪声底）
    arr += rng.normal(0.0, 9.0, arr.shape).astype(np.float32)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    if spot:
        d = ImageDraw.Draw(img)
        rng2 = np.random.default_rng(7)
        for _ in range(8):
            cx, cy = int(rng2.integers(20, size - 20)), int(rng2.integers(20, size - 20))
            d.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=(110, 70, 60))
    return img


class TestFrequencyCore:
    def test_frequency_split_shapes(self):
        img = make_synthetic_portrait(spot=False)
        low, high = frequency_split(img, radius=12.0)
        assert low.shape == high.shape == (256, 256, 3)

    def test_skin_mask_cover(self):
        img = make_synthetic_portrait(spot=False)
        m = skin_mask(img)
        assert m.dtype == np.float32
        assert 0.0 <= m.min() and m.max() <= 1.0
        assert float(m.mean()) > 0.3  # 肤色底应大面积命中

    def test_skin_smooth_reduces_lowfreq_variance(self):
        img = make_synthetic_portrait(spot=True)
        before = lowfreq_variance(img, radius=12.0)
        after_img = neutral_grey_retouch(img, radius=12.0, smooth=0.7, amp=3.0)
        after = lowfreq_variance(after_img, radius=12.0)
        assert after < before * 0.5, f"低频方差应下降 ≥50%: {before:.1f} -> {after:.1f}"

    def test_neutral_grey_preserves_spots(self):
        """职责分离：磨皮不得显著改动斑点（小尺度斑点对比度保留）。"""
        img = make_synthetic_portrait(spot=True)
        before = spot_contrast(img, radius=4.0)
        smoothed = neutral_grey_retouch(img)
        after = spot_contrast(smoothed, radius=4.0)
        assert after > before * 0.85, f"磨皮不应消斑: {before:.2f} -> {after:.2f}"

    def test_blemish_reduces_spot_contrast(self):
        """管线顺序：先磨皮（低频）后祛斑（高频），斑点幅度相对原图显著下降。"""
        img = make_synthetic_portrait(spot=True)
        before = spot_contrast(img, radius=12.0)
        before4_raw = spot_contrast(img, radius=4.0)
        smoothed = neutral_grey_retouch(img)
        cleaned = blemish_remove(smoothed, strength=0.9)
        after = spot_contrast(cleaned, radius=12.0)
        after4 = spot_contrast(cleaned, radius=4.0)
        assert after < before * 0.70, f"祛斑应显著降斑(r12, 相对原图): {before:.2f} -> {after:.2f}"
        assert after4 < before4_raw * 0.85, f"祛斑应降斑(r4, 相对原图): {before4_raw:.2f} -> {after4:.2f}"

    def test_texture_keep_ratio(self):
        img = make_synthetic_portrait(spot=True)
        before_e = texture_energy(img)
        out = neutral_grey_retouch(img, radius=12.0, smooth=0.7, amp=3.0)
        out = blemish_remove(out, strength=0.9)
        after_e = texture_energy(out)
        keep = after_e / max(before_e, 1e-6)
        assert keep >= 0.70, f"纹理保留率应 ≥70%: {keep:.2f}"


class TestQCGate:
    def test_normal_retouch_not_falsely_blocked(self):
        img = make_synthetic_portrait(spot=True)
        out = neutral_grey_retouch(img, radius=12.0, smooth=0.7, amp=3.0)
        out = blemish_remove(out, strength=0.9)
        report = qc_retouch(img, out, ["skin_smooth", "blemish_remove"])
        assert report["verdict"] in ("pass", "warn")
        assert report["verdict"] != "reject"
        assert report["findings"]

    def test_over_smoothing_rejected(self):
        """过度磨皮（纹理压扁）必须 reject。"""
        img = make_synthetic_portrait(spot=True)
        over = img.filter(ImageFilter.GaussianBlur(8.0))
        report = qc_retouch(img, over, ["skin_smooth"])
        assert report["verdict"] == "reject"
        assert any("塑料" in f for f in report["findings"])

    def test_metrics_in_report(self):
        img = make_synthetic_portrait(spot=True)
        report = qc_retouch(img, img, ["skin_smooth"])
        assert 0.0 <= report["texture_keep"] <= 2.0
        assert isinstance(report["spot_removed"], float)
