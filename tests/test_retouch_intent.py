# -*- coding: utf-8 -*-
# file: tests/test_retouch_intent.py
# 作用：NC-RET-01 指令解析器 —— 方案 7 条基准用例 + 红线闸门
from web.backend.retouch.intent import check_redlines, parse_retouch_intent


class TestSevenBaselineCases:
    """验收基准：7 条真实语句（方案第 3 节表格）。"""

    def test_case1_skin_smooth_natural(self):
        spec = parse_retouch_intent("帮我磨皮，自然一点")
        assert spec.ops == ["skin_smooth"]
        assert spec.strength == 0.5
        assert spec.level == "L2"
        assert spec.allowed is True

    def test_case2_multi_op_portrait_blocked(self):
        spec = parse_retouch_intent("祛痘祛斑，顺便统一一下肤色，再瘦个脸")
        assert sorted(spec.ops) == ["blemish_remove", "face_reshape", "skin_tone_unify"]
        assert spec.level == "L4"
        assert spec.allowed is False
        assert any("肖像授权" in r for r in spec.redlines)

    def test_case3_local_watermark_blocked(self):
        spec = parse_retouch_intent("只把左上角那个水印去掉")
        assert spec.ops == ["remove_watermark"]
        assert spec.level == "L3"
        assert spec.allowed is False
        assert any("知识产权" in r for r in spec.redlines)

    def test_case4_product_multi_op(self):
        spec = parse_retouch_intent("产品图帮我打个光，金属质感强一点，再高清放大到4K")
        assert sorted(spec.ops) == ["product_light", "product_texture", "upscale"]
        assert spec.strength == 0.8
        assert spec.level == "L4"
        assert spec.allowed is True

    def test_case5_bg_replace_l1(self):
        spec = parse_retouch_intent("把商品换成风景背景")
        assert spec.ops == ["bg_replace"]
        assert spec.level == "L1"
        assert spec.allowed is True

    def test_case6_face_swap_redline(self):
        spec = parse_retouch_intent("把人换成另一个模特")
        assert spec.ops == ["face_swap"]
        assert spec.level == "L1"
        assert spec.allowed is False
        assert any("红线" in r for r in spec.redlines)

    def test_case7_no_ops_asks_back(self):
        spec = parse_retouch_intent("随便弄弄")
        assert spec.ops == []
        assert spec.allowed is False
        assert len(spec.questions) >= 1
        assert spec.questions[0]


class TestLevelsAndAuth:
    def test_portrait_auth_grants_reshape(self):
        spec = parse_retouch_intent(
            "瘦脸", auth={"portrait_granted": True}
        )
        assert spec.ops == ["face_reshape"]
        assert spec.allowed is True

    def test_ip_cleared_allows_watermark(self):
        spec = parse_retouch_intent("去掉水印", auth={"ip_cleared": True})
        assert spec.ops == ["remove_watermark"]
        assert spec.allowed is True

    def test_product_outpaint_blocked(self):
        spec = parse_retouch_intent("商品图扩一下图")
        assert "outpaint" in spec.ops
        assert spec.allowed is False
        assert any("商品本体" in r for r in spec.redlines)

    def test_face_swap_always_needs_human_confirm(self):
        ok, reasons = check_redlines("portrait", ["face_swap"], {"portrait_granted": True})
        assert ok is False
        assert any("人工最终确认" in r for r in reasons)


class TestOpsCatalog:
    def test_21_ops_registered(self):
        from web.backend.retouch.ops import OPS

        assert len(OPS) == 21

    def test_strength_default_when_no_word(self):
        spec = parse_retouch_intent("磨皮一下")
        assert spec.ops == ["skin_smooth"]
        assert spec.level == "L1"
        assert spec.strength == 0.5
