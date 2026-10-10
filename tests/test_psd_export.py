# -*- coding: utf-8 -*-
# tests/test_psd_export.py —— P2-2 PSD 导出
from __future__ import annotations

import base64
import struct

import pytest
from fastapi.testclient import TestClient

from web.backend.export.psd import Layer, write_psd
from web.backend.main import app

client = TestClient(app)


def _make_pixels(w: int, h: int, rgba=(255, 0, 0, 255)) -> bytes:
    return bytes(rgba) * (w * h)


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


class TestPsdWriter:
    def test_header_magic(self):
        layer = Layer("L1", 0, 0, 10, 10, _make_pixels(10, 10))
        data = write_psd([layer], 10, 10)
        assert data[:4] == b"8BPS"
        # version = 1
        assert struct.unpack(">H", data[4:6])[0] == 1
        # channels = 3
        assert struct.unpack(">H", data[12:14])[0] == 3
        # height = 10
        assert struct.unpack(">I", data[14:18])[0] == 10
        # width = 10
        assert struct.unpack(">I", data[18:22])[0] == 10
        # depth = 8
        assert struct.unpack(">H", data[22:24])[0] == 8
        # color mode = 3 (RGB)
        assert struct.unpack(">H", data[24:26])[0] == 3

    def test_multi_layer_size(self):
        l1 = Layer("bg", 0, 0, 20, 20, _make_pixels(20, 20, (0, 255, 0, 255)))
        l2 = Layer("fg", 5, 5, 15, 15, _make_pixels(10, 10, (0, 0, 255, 200)))
        data = write_psd([l1, l2], 20, 20)
        # 至少包含两个图层名
        assert b"bg" in data
        assert b"fg" in data
        # 文件总长大于单层
        single = write_psd([l1], 20, 20)
        assert len(data) > len(single)

    def test_pixel_length_mismatch(self):
        layer = Layer("bad", 0, 0, 10, 10, b"\x00" * 5)
        with pytest.raises(ValueError):
            write_psd([layer], 10, 10)

    def test_empty_layers(self):
        with pytest.raises(ValueError):
            write_psd([], 10, 10)

    def test_zero_canvas(self):
        layer = Layer("L", 0, 0, 0, 0, b"")
        with pytest.raises(ValueError):
            write_psd([layer], 0, 10)


class TestExportApi:
    def test_export_psd_flat(self):
        pixels = _make_pixels(8, 8)
        r = client.post(
            "/api/export/psd",
            json={"width": 8, "height": 8, "flat_b64": _b64(pixels)},
        )
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/octet-stream")
        assert r.content[:4] == b"8BPS"
        assert "export.psd" in r.headers.get("content-disposition", "")

    def test_export_psd_layers(self):
        layers = [
            {"name": "bg", "width": 4, "height": 4, "pixels_b64": _b64(_make_pixels(4, 4))},
            {
                "name": "fg",
                "left": 1,
                "top": 1,
                "width": 2,
                "height": 2,
                "pixels_b64": _b64(_make_pixels(2, 2, (0, 0, 255, 255))),
                "opacity": 0.8,
            },
        ]
        r = client.post(
            "/api/export/psd", json={"width": 4, "height": 4, "layers": layers}
        )
        assert r.status_code == 200
        assert r.content[:4] == b"8BPS"

    def test_pixel_length_mismatch_api(self):
        layers = [{"name": "bad", "width": 4, "height": 4, "pixels_b64": _b64(b"\x00" * 3)}]
        r = client.post("/api/export/psd", json={"width": 4, "height": 4, "layers": layers})
        assert r.status_code == 400

    def test_no_layers_no_flat(self):
        r = client.post("/api/export/psd", json={"width": 4, "height": 4})
        assert r.status_code == 400

    def test_bad_canvas(self):
        r = client.post(
            "/api/export/psd",
            json={"width": 0, "height": 4, "flat_b64": _b64(b"")},
        )
        assert r.status_code == 400

    def test_bad_base64(self):
        r = client.post(
            "/api/export/psd",
            json={"width": 2, "height": 2, "flat_b64": "!!!not-base64!!!"},
        )
        assert r.status_code == 400
