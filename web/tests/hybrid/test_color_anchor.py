"""NC-HYB-03 单元测试：色彩锚定引擎。

验收标准（执行方案 459-463 行）：
- LUT 文件必须包含 LUT_3D_SIZE 33 且数据行数恰好 35937（=33³）
- 偏暖参考帧（R>B）与偏冷片段（B>R）：估算色温偏低/偏高，wb_gain 方向相反
- build_prompt_with_anchor() 输出必须包含"色温"与"光源方向"
- match_strength=88 时，strength 参数线性调节校正幅度
"""

import os
import sys

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.hybrid.color_anchor import (
    LUT_SIZE, ColorAnchor, _estimate_kelvin, _lighting_prompt,
    extract_anchor, write_cube_lut, build_prompt_with_anchor, save_anchor,
)

LUT_SIZE_CUBE = 33 ** 3  # 35937


def _make_image(path, r, g, b, size=(160, 120)):
    arr = np.zeros((size[1], size[0], 3), dtype=np.uint8)
    arr[..., 0], arr[..., 1], arr[..., 2] = r, g, b
    Image.fromarray(arr).save(path)
    return path


# ── 1. _estimate_kelvin：暖帧 K 偏低、冷帧 K 偏高、方向相反 ──────────
def test_estimate_kelvin_warm_vs_cold():
    k_warm = _estimate_kelvin(r_mean=200.0, b_mean=90.0)    # R > B → 暖
    k_cold = _estimate_kelvin(r_mean=90.0, b_mean=200.0)    # B > R → 冷
    assert k_warm < k_cold, f"暖帧色温应偏低: warm={k_warm}, cold={k_cold}"
    assert k_warm < 6500 < k_cold, f"warm={k_warm} < 6500 < cold={k_cold}"
    # 钳制在 2000-12000
    assert _estimate_kelvin(10000.0, 0.001) >= 2000
    assert _estimate_kelvin(0.001, 10000.0) <= 12000
    print(f"✓ 色温方向正确: warm={k_warm}K, cold={k_cold}K")


# ── 2. wb_gain 方向相反 ─────────────────────────────────────────────
def test_extract_anchor_wb_gain_direction(tmp_path):
    warm_img = _make_image(str(tmp_path / "warm.png"), r=200, g=140, b=90)
    cold_img = _make_image(str(tmp_path / "cold.png"), r=90, g=140, b=200)

    a_warm = extract_anchor(warm_img, "CA-WARM", match_strength=70)
    a_cold = extract_anchor(cold_img, "CA-COLD", match_strength=70)

    # 暖帧：R 均值高 → r_gain = gray/r < b_gain = gray/b；冷帧相反
    assert a_warm.wb_gain[0] < a_warm.wb_gain[2], f"暖帧 r_gain 应 < b_gain: {a_warm.wb_gain}"
    assert a_cold.wb_gain[0] > a_cold.wb_gain[2], f"冷帧 r_gain 应 > b_gain: {a_cold.wb_gain}"
    assert a_warm.kelvin < a_cold.kelvin
    assert a_warm.match_strength == 70
    print(f"✓ wb_gain 方向相反: warm={a_warm.wb_gain}, cold={a_cold.wb_gain}")


# ── 3. match_strength 档位 ──────────────────────────────────────────
def test_match_strength_levels():
    img = _make_image(os.path.join(str(os.path.dirname(__file__)), "_tmp_ref.png"),
                      r=180, g=160, b=140)
    try:
        portrait = extract_anchor(img, "CA-P", match_strength=70)   # 人像 60-80
        product = extract_anchor(img, "CA-E", match_strength=88)    # 电商 85-100
        assert 60 <= portrait.match_strength <= 80
        assert 85 <= product.match_strength <= 100
        print(f"✓ match_strength 档位: portrait={portrait.match_strength}, product={product.match_strength}")
    finally:
        os.unlink(img)


# ── 4. LUT：LUT_3D_SIZE 33 + 数据行恰好 35937 ──────────────────────
def test_write_cube_lut_size(tmp_path):
    img = _make_image(str(tmp_path / "ref.png"), r=190, g=150, b=110)
    anchor = extract_anchor(img, "CA-LUT", match_strength=88)
    out = str(tmp_path / "anchor.cube")
    write_cube_lut(anchor, out)

    with open(out, encoding="utf-8") as f:
        lines = [ln.rstrip("\n") for ln in f]

    assert any("LUT_3D_SIZE 33" in ln for ln in lines), "必须包含 LUT_3D_SIZE 33"
    # 数据行：去掉头部 4 行声明 + 1 行空行
    header = 5
    data_lines = [ln for ln in lines[header:] if ln.strip()]
    assert len(data_lines) == LUT_SIZE_CUBE, \
        f"数据行必须恰好 {LUT_SIZE_CUBE}，实际 {len(data_lines)}"
    # 每行 3 个 0-1 浮点数
    for ln in data_lines[:100]:
        parts = ln.split()
        assert len(parts) == 3
        for p in parts:
            v = float(p)
            assert 0.0 <= v <= 1.0
    print(f"✓ LUT {LUT_SIZE}³ 数据行 = {len(data_lines)}")


# ── 5. strength 线性调节校正幅度 ────────────────────────────────────
def test_lut_strength_linear(tmp_path):
    img = _make_image(str(tmp_path / "ref2.png"), r=210, g=130, b=80)
    anchor = extract_anchor(img, "CA-S", match_strength=88)

    def first_data_line(strength):
        out = str(tmp_path / f"s{strength}.cube")
        write_cube_lut(anchor, out, strength=strength)
        with open(out, encoding="utf-8") as f:
            lines = [ln.strip() for ln in f if ln.strip()]
        return lines[5]  # 第一条数据行

    # 第一条数据行对应输入 (0,0,0)，全零乘任何增益仍为 0 → 改用中间行
    def mid_line(strength):
        out = str(tmp_path / f"m{strength}.cube")
        write_cube_lut(anchor, out, strength=strength)
        with open(out, encoding="utf-8") as f:
            lines = [ln.strip() for ln in f if ln.strip()]
        # 过滤空行后头部 4 行，数据从索引 4 开始；(i,j,k)=(16,16,16) → 输入 0.5
        return lines[4 + 16 * 33 * 33 + 16 * 33 + 16]  # 网格点 16/32 = 0.5

    mid0 = np.array([float(x) for x in mid_line(0.0).split()])
    mid5 = np.array([float(x) for x in mid_line(0.5).split()])
    mid1 = np.array([float(x) for x in mid_line(1.0).split()])

    assert np.allclose(mid0, 0.5, atol=1e-6), "strength=0 时输出=输入（无校正）"
    # 中点校正幅度：|mid1-0.5| > |mid5-0.5| > |mid0-0.5|=0
    d1 = np.abs(mid1 - 0.5).sum()
    d5 = np.abs(mid5 - 0.5).sum()
    assert d1 > d5 > 0, f"strength 应线性增大校正幅度: d5={d5}, d1={d1}"
    # 线性：0.5 的幅度约为 1.0 的一半
    assert abs(d5 - d1 / 2) < 1e-3, f"应线性: d5={d5} ≈ d1/2={d1/2}"
    print(f"✓ strength 线性调节: d(0.5)={d5:.4f}, d(1.0)={d1:.4f}")


# ── 6. build_prompt_with_anchor 含"色温"与"光源方向" ────────────────
def test_prompt_contains_keywords(tmp_path):
    img = _make_image(str(tmp_path / "ref3.png"), r=170, g=155, b=145)
    anchor = extract_anchor(img, "CA-PROMPT", match_strength=70)
    out = build_prompt_with_anchor("一位年轻女性在海边微笑", anchor)
    assert "色温" in out, f"提示词缺'色温': {out}"
    assert "光源方向" in out, f"提示词缺'光源方向': {out}"
    assert "一位年轻女性在海边微笑" in out, "原提示词应保留"
    print(f"✓ 前向注入提示词: {out}")


# ── 7. _lighting_prompt 三档温度措辞 ────────────────────────────────
def test_lighting_prompt_wording():
    assert "偏暖" in _lighting_prompt(4800, 40, 0.3)
    assert "偏冷" in _lighting_prompt(7500, 60, 0.3)
    assert "中性" in _lighting_prompt(5800, 40, 0.3)
    print("✓ 光线段温度措辞正确")


# ── 8. save_anchor 往返 ─────────────────────────────────────────────
def test_save_anchor_roundtrip(tmp_path):
    import json
    img = _make_image(str(tmp_path / "ref4.png"), r=160, g=150, b=140)
    anchor = extract_anchor(img, "CA-R", match_strength=65)
    path = save_anchor(anchor, str(tmp_path / "anchors" / "CA-R.json"))
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    assert data["anchor_id"] == "CA-R"
    assert data["match_strength"] == 65
    assert data["kelvin"] == anchor.kelvin
    print("✓ save_anchor JSON 往返一致")


if __name__ == "__main__":
    import tempfile
    import pathlib
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            if "tmp_path" in fn.__code__.co_varnames[:fn.__code__.co_argcount]:
                with tempfile.TemporaryDirectory() as d:
                    fn(pathlib.Path(d))
            else:
                fn()
    print("\n🎉 所有 NC-HYB-03 单元测试通过！")