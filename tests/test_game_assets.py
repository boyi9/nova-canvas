# -*- coding: utf-8 -*-
# tests/test_game_assets.py —— P2-4 游戏资产：sprite sheet / 纹理 / tilemap
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from web.backend.game_assets import (
    SPRITE_PRESETS,
    TILEMAP_PRESETS,
    SpecError,
    pack_grid,
    plan_sprite_sheet,
    plan_texture,
    plan_tilemap,
    slice_frames,
    validate_bleed,
)
from web.backend.main import create_app

client = TestClient(create_app())


class TestPackGrid:
    def test_exact_fit(self):
        assert pack_grid(64, 8) == (8, 8)

    def test_ragged_rows(self):
        assert pack_grid(10, 8) == (8, 2)

    def test_invalid(self):
        with pytest.raises(SpecError):
            pack_grid(0, 8)
        with pytest.raises(SpecError):
            pack_grid(10, 0)


class TestSliceFrames:
    def test_grid_rects(self):
        # 64×32 的 sheet 放 32×32 帧 → 2 列 1 行
        frames = slice_frames(64, 32, 32, 32)
        assert len(frames) == 2
        assert frames[0] == (0, 0, 32, 32)
        assert frames[1] == (32, 0, 32, 32)

    def test_two_by_two(self):
        frames = slice_frames(64, 64, 32, 32)
        assert len(frames) == 4
        assert frames[3] == (32, 32, 32, 32)

    def test_single_frame(self):
        assert slice_frames(16, 16, 16, 16) == [(0, 0, 16, 16)]

    def test_invalid_frame_size(self):
        with pytest.raises(SpecError):
            slice_frames(32, 32, 0, 16)


class TestBleed:
    def test_ok(self):
        validate_bleed(2, 32)

    def test_negative(self):
        with pytest.raises(SpecError):
            validate_bleed(-1, 32)

    def test_too_large(self):
        with pytest.raises(SpecError):
            validate_bleed(16, 32)


class TestSpriteSheet:
    def test_auto_layout_is_squarish(self):
        s = plan_sprite_sheet(32, 32, 60)
        assert s.columns == 8 and s.rows == 8
        assert s.count == 64

    def test_sheet_size_includes_bleed_and_padding(self):
        s = plan_sprite_sheet(32, 32, 64, columns=8, rows=8, bleed_px=2, padding_px=2)
        # cell = 32 + 2*2 + 2*2 = 40
        assert s.sheet_width == 40 * 8
        assert s.sheet_height == 40 * 8

    def test_frames_count_matches_grid(self):
        s = plan_sprite_sheet(16, 16, 30, columns=6)
        assert s.columns == 6 and s.rows == 5
        assert len(s.frames) == 30

    def test_explicit_grid_wins_over_count(self):
        s = plan_sprite_sheet(16, 16, 4, columns=8, rows=8)
        assert s.count == 64

    def test_rows_only(self):
        s = plan_sprite_sheet(16, 16, 20, rows=5)
        assert s.rows == 5 and s.columns == 4

    def test_rejects_zero_frame(self):
        with pytest.raises(SpecError):
            plan_sprite_sheet(0, 32, 10)

    def test_rejects_negative_padding(self):
        with pytest.raises(SpecError):
            plan_sprite_sheet(32, 32, 10, padding_px=-1)

    def test_rejects_oversized_sheet(self):
        with pytest.raises(SpecError):
            plan_sprite_sheet(2048, 2048, 4000, columns=4, rows=4)

    def test_api(self):
        r = client.post(
            "/api/game-assets/sprite-sheet",
            json={"frame_width": 32, "frame_height": 32, "count": 64, "columns": 8},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["sheet_width"] > 0
        assert len(d["frames"]) == 64

    def test_api_rejects_bad_bleed(self):
        r = client.post(
            "/api/game-assets/sprite-sheet",
            json={"frame_width": 16, "frame_height": 16, "count": 4, "bleed_px": 8},
        )
        assert r.status_code == 400

    def test_all_presets_expand(self):
        for preset_id in SPRITE_PRESETS:
            r = client.post(f"/api/game-assets/preset/{preset_id}")
            assert r.status_code == 200, preset_id
            assert r.json()["spec"]["sheet_width"] > 0

    def test_unknown_preset_404(self):
        assert client.post("/api/game-assets/preset/nope").status_code == 404


class TestTexture:
    def test_rgba8888_size(self):
        t = plan_texture(1024, 1024, mipmaps=False)
        assert t.estimated_bytes == 1024 * 1024 * 4

    def test_mipmaps_add_third(self):
        t = plan_texture(1024, 1024, mipmaps=True)
        assert int(t.estimated_bytes * 1.08) > 1024 * 1024 * 4

    def test_rgb888_smaller(self):
        rgba = plan_texture(512, 512, mipmaps=False, format="rgba8888")
        rgb = plan_texture(512, 512, mipmaps=False, format="rgb888")
        assert rgb.estimated_bytes < rgba.estimated_bytes

    def test_invalid_dimensions(self):
        with pytest.raises(SpecError):
            plan_texture(0, 512)

    def test_oversized_rejected(self):
        with pytest.raises(SpecError):
            plan_texture(16384, 512)

    def test_invalid_anisotropy(self):
        with pytest.raises(SpecError):
            plan_texture(512, 512, anisotropy=3)

    def test_invalid_format(self):
        with pytest.raises(SpecError):
            plan_texture(512, 512, format="bc7")

    def test_api(self):
        r = client.post("/api/game-assets/texture", json={"width": 2048, "height": 2048})
        assert r.status_code == 200
        assert r.json()["estimated_mb"] > 0

    def test_api_rejects_bad_anisotropy(self):
        r = client.post(
            "/api/game-assets/texture", json={"width": 512, "height": 512, "anisotropy": 3}
        )
        assert r.status_code == 400


class TestTilemap:
    def test_index_size(self):
        m = plan_tilemap(100, 100, layer_count=3)
        # 100*100*3 层 * 2 字节(uint16)
        assert m.estimated_bytes == 100 * 100 * 3 * 2

    def test_invalid(self):
        with pytest.raises(SpecError):
            plan_tilemap(0, 10)
        with pytest.raises(SpecError):
            plan_tilemap(10, 10, layer_count=0)

    def test_api(self):
        r = client.post(
            "/api/game-assets/tilemap",
            json={"columns": 200, "rows": 200, "layer_count": 4},
        )
        assert r.status_code == 200
        assert r.json()["estimated_kb"] > 0

    def test_all_tilemap_presets(self):
        for preset_id in TILEMAP_PRESETS:
            r = client.post(f"/api/game-assets/preset/{preset_id}")
            assert r.status_code == 200, preset_id
            assert r.json()["spec"]["columns"] > 0

    def test_presets_listing(self):
        d = client.get("/api/game-assets/presets").json()
        assert len(d["sprite_presets"]) >= 5
        assert len(d["tilemap_presets"]) >= 4