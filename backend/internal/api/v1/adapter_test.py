"""
adapter_test.py — AI-001 适配器单元测试
使用标准库 unittest + unittest.mock 对 urllib 进行 mock，
覆盖所有适配器、工厂、错误路径与边界场景，目标覆盖率 ≥80%。
"""

import json
import unittest
import base64
from unittest import mock

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))

from backend.internal.api.v1.adapter import (  # noqa: E402
    ChatMessage,
    GenerationRequest,
    GenerationResponse,
    ImageGenerationRequest,
    ImageGenerationResponse,
    AudioGenerationRequest,
    AudioGenerationResponse,
    VideoGenerationRequest,
    VideoGenerationResponse,
    AdapterError,
    BaseAdapter,
    OpenAIAdapter,
    AzureAdapter,
    OllamaAdapter,
    build_adapter,
)


def _fake_response(payload: dict, code: int = 200):
    """构造一个支持 with 语句与 .read() 的假响应。"""
    body = json.dumps(payload).encode("utf-8")

    class _Resp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return body

    return _Resp()


def _fake_stream(lines):
    """构造支持 with 与迭代的假流式响应。"""

    class _Resp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def __iter__(self):
            return iter(lines)

    return _Resp()


def _fake_raw(content: bytes):
    """构造返回原始字节（非 JSON）的假响应，用于音频等场景。"""

    class _Resp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return content

    return _Resp()


class TestOpenAIAdapter(unittest.TestCase):
    def _patch(self, payload):
        return mock.patch(
            "urllib.request.urlopen", return_value=_fake_response(payload)
        )

    def test_chat_success(self):
        payload = {
            "id": "chatcmpl-1",
            "model": "gpt-4o",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "hi"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7},
        }
        with self._patch(payload):
            adapter = OpenAIAdapter(base_url="https://api.openai.com", api_key="sk-test")
            req = GenerationRequest(model="gpt-4o", messages=[ChatMessage(role="user", content="hello")])
            resp = adapter.chat(req)
        self.assertIsInstance(resp, GenerationResponse)
        self.assertEqual(resp.model, "gpt-4o")
        self.assertEqual(resp.choices[0]["message"]["content"], "hi")
        self.assertEqual(resp.usage["total_tokens"], 7)

    def test_to_openai_payload_maps_fields(self):
        with self._patch({"id": "x", "model": "m", "choices": []}):
            adapter = OpenAIAdapter(base_url="https://api.openai.com")
            req = GenerationRequest(
                model="m", messages=[ChatMessage(role="user", content="c")], temperature=0.3, stream=True
            )
            resp = adapter.chat(req)
        self.assertEqual(resp.model, "m")

    def test_headers_include_bearer(self):
        adapter = OpenAIAdapter(base_url="https://x", api_key="sk-abc")
        headers = adapter._headers()
        self.assertEqual(headers["Authorization"], "Bearer sk-abc")

    def test_headers_no_key(self):
        adapter = OpenAIAdapter(base_url="https://x")
        self.assertNotIn("Authorization", adapter._headers())


class TestAzureAdapter(unittest.TestCase):
    def test_chat_success(self):
        payload = {
            "id": "az-1",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "azure hi"}, "finish_reason": "stop"}],
            "usage": {"total_tokens": 3},
        }
        with mock.patch("urllib.request.urlopen", return_value=_fake_response(payload)):
            adapter = AzureAdapter(base_url="https://res.openai.azure.com", api_key="k", api_version="2024-02-15-preview")
            req = GenerationRequest(model="deploy-1", messages=[ChatMessage(role="user", content="hi")])
            resp = adapter.chat(req)
        self.assertEqual(resp.model, "deploy-1")
        self.assertEqual(resp.choices[0]["message"]["content"], "azure hi")


class TestOllamaAdapter(unittest.TestCase):
    def test_chat_success(self):
        payload = {
            "model": "deepseek-r1:7b",
            "message": {"role": "assistant", "content": "ollama hi"},
            "done": True,
        }
        with mock.patch("urllib.request.urlopen", return_value=_fake_response(payload)):
            adapter = OllamaAdapter(base_url="http://localhost:11434")
            req = GenerationRequest(model="deepseek-r1:7b", messages=[ChatMessage(role="user", content="hi")])
            resp = adapter.chat(req)
        self.assertEqual(resp.choices[0]["message"]["content"], "ollama hi")
        self.assertEqual(resp.model, "deepseek-r1:7b")

    def test_chat_stream_yields_content(self):
        lines = [
            json.dumps({"message": {"content": "Hel"}, "done": False}).encode(),
            json.dumps({"message": {"content": "lo"}, "done": True}).encode(),
        ]
        with mock.patch("urllib.request.urlopen", return_value=_fake_stream(lines)):
            adapter = OllamaAdapter(base_url="http://localhost:11434")
            req = GenerationRequest(model="deepseek-r1:7b", messages=[ChatMessage(role="user", content="hi")])
            out = "".join(adapter.chat_stream(req))
        self.assertEqual(out, "Hello")

    def test_chat_stream_skips_bad_json(self):
        lines = [b"not-json", json.dumps({"message": {"content": "ok"}, "done": True}).encode()]
        with mock.patch("urllib.request.urlopen", return_value=_fake_stream(lines)):
            adapter = OllamaAdapter(base_url="http://localhost:11434")
            req = GenerationRequest(model="m", messages=[ChatMessage(role="user", content="hi")])
            out = "".join(adapter.chat_stream(req))
        self.assertEqual(out, "ok")


class TestBuildAdapter(unittest.TestCase):
    def test_openai(self):
        a = build_adapter("openai")
        self.assertIsInstance(a, OpenAIAdapter)

    def test_azure(self):
        a = build_adapter("azure")
        self.assertIsInstance(a, AzureAdapter)

    def test_ollama(self):
        a = build_adapter("ollama")
        self.assertIsInstance(a, OllamaAdapter)

    def test_case_insensitive(self):
        a = build_adapter("Ollama")
        self.assertIsInstance(a, OllamaAdapter)

    def test_unknown_provider_raises(self):
        with self.assertRaises(AdapterError) as ctx:
            build_adapter("unknown")
        self.assertEqual(ctx.exception.status_code, 400)


class TestAdapterErrorPaths(unittest.TestCase):
    def test_http_error_raises_adapter_error(self):
        import urllib.error

        def _raise(*a, **k):
            raise urllib.error.HTTPError(url="x", code=401, msg="unauth", hdrs=None, fp=None)

        with mock.patch("urllib.request.urlopen", side_effect=_raise):
            adapter = OpenAIAdapter(base_url="https://x", api_key="bad")
            req = GenerationRequest(model="m", messages=[ChatMessage(role="user", content="c")])
            with self.assertRaises(AdapterError) as ctx:
                adapter.chat(req)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_url_error_raises_502(self):
        import urllib.error

        def _raise(*a, **k):
            raise urllib.error.URLError(reason="conn refused")

        with mock.patch("urllib.request.urlopen", side_effect=_raise):
            adapter = OllamaAdapter(base_url="http://localhost:11434")
            req = GenerationRequest(model="m", messages=[ChatMessage(role="user", content="c")])
            with self.assertRaises(AdapterError) as ctx:
                adapter.chat(req)
        self.assertEqual(ctx.exception.status_code, 502)


class TestOpenAIImage(unittest.TestCase):
    def test_generate_image_success(self):
        payload = {"id": "img-1", "created": 1700000000, "data": [{"b64_json": "AAAA"}]}
        with mock.patch("urllib.request.urlopen", return_value=_fake_response(payload)):
            adapter = OpenAIAdapter(base_url="https://api.openai.com", api_key="sk-x")
            resp = adapter.generate_image(ImageGenerationRequest(prompt="a cat"))
        self.assertIsInstance(resp, ImageGenerationResponse)
        self.assertEqual(resp.data[0]["b64_json"], "AAAA")
        self.assertEqual(resp.model, "dall-e-3")

    def test_edit_image_success(self):
        payload = {"id": "img-2", "created": 1700000001, "data": [{"b64_json": "BBBB"}]}
        with mock.patch("urllib.request.urlopen", return_value=_fake_response(payload)):
            adapter = OpenAIAdapter(base_url="https://api.openai.com", api_key="sk-x")
            resp = adapter.edit_image(
                ImageGenerationRequest(prompt="make it blue", reference_image_b64="BASE64IMG")
            )
        self.assertEqual(resp.data[0]["b64_json"], "BBBB")


class TestOllamaImage(unittest.TestCase):
    def test_generate_image_no_model_raises_501(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            adapter = OllamaAdapter(base_url="http://localhost:11434")
            with self.assertRaises(AdapterError) as ctx:
                adapter.generate_image(ImageGenerationRequest(prompt="a cat"))
        self.assertEqual(ctx.exception.status_code, 501)

    def test_generate_image_with_model_returns_data(self):
        payload = {"model": "flux", "response": "BASE64OUTPUT"}
        with mock.patch.dict(os.environ, {"OLLAMA_IMAGE_MODEL": "flux"}):
            with mock.patch("urllib.request.urlopen", return_value=_fake_response(payload)):
                adapter = OllamaAdapter(base_url="http://localhost:11434")
                resp = adapter.generate_image(ImageGenerationRequest(prompt="a cat"))
        self.assertEqual(resp.data[0]["b64_json"], "BASE64OUTPUT")
        self.assertEqual(resp.model, "flux")

    def test_edit_image_requires_reference(self):
        with mock.patch.dict(os.environ, {"OLLAMA_IMAGE_MODEL": "flux"}):
            adapter = OllamaAdapter(base_url="http://localhost:11434")
            with self.assertRaises(AdapterError) as ctx:
                adapter.edit_image(ImageGenerationRequest(prompt="recolor"))
        self.assertEqual(ctx.exception.status_code, 400)

    def test_edit_image_passes_reference(self):
        payload = {"model": "flux", "response": "EDITED"}
        with mock.patch.dict(os.environ, {"OLLAMA_IMAGE_MODEL": "flux"}):
            with mock.patch("urllib.request.urlopen", return_value=_fake_response(payload)):
                adapter = OllamaAdapter(base_url="http://localhost:11434")
                resp = adapter.edit_image(
                    ImageGenerationRequest(prompt="recolor", reference_image_b64="IMG")
                )
        self.assertEqual(resp.data[0]["b64_json"], "EDITED")


class TestAudioVideo(unittest.TestCase):
    def test_openai_generate_audio(self):
        raw_bytes = b"\x00\x01\x02fakeaudio"
        with mock.patch("urllib.request.urlopen", return_value=_fake_raw(raw_bytes)):
            adapter = OpenAIAdapter(base_url="https://api.openai.com", api_key="sk-x")
            resp = adapter.generate_audio(AudioGenerationRequest(text="hello"))
        self.assertIsInstance(resp, AudioGenerationResponse)
        import base64 as _b64

        self.assertEqual(resp.audio_b64, _b64.b64encode(raw_bytes).decode("ascii"))

    def test_openai_generate_video_501(self):
        adapter = OpenAIAdapter(base_url="https://api.openai.com", api_key="sk-x")
        with self.assertRaises(AdapterError) as ctx:
            adapter.generate_video(VideoGenerationRequest(prompt="a cat video"))
        self.assertEqual(ctx.exception.status_code, 501)

    def test_azure_generate_audio(self):
        raw_bytes = b"azaudio"
        with mock.patch("urllib.request.urlopen", return_value=_fake_raw(raw_bytes)):
            adapter = AzureAdapter(base_url="https://res.openai.azure.com", api_key="k", api_version="2024-02-15-preview")
            resp = adapter.generate_audio(AudioGenerationRequest(text="hi", model="tts-1"))
        self.assertEqual(resp.audio_b64, base64.b64encode(raw_bytes).decode("ascii"))

    def test_azure_generate_video_501(self):
        adapter = AzureAdapter(base_url="x", api_key="k", api_version="v")
        with self.assertRaises(AdapterError) as ctx:
            adapter.generate_video(VideoGenerationRequest(prompt="x"))
        self.assertEqual(ctx.exception.status_code, 501)

    def test_ollama_audio_501(self):
        adapter = OllamaAdapter(base_url="http://localhost:11434")
        with self.assertRaises(AdapterError) as ctx:
            adapter.generate_audio(AudioGenerationRequest(text="hi"))
        self.assertEqual(ctx.exception.status_code, 501)

    def test_ollama_video_501(self):
        adapter = OllamaAdapter(base_url="http://localhost:11434")
        with self.assertRaises(AdapterError) as ctx:
            adapter.generate_video(VideoGenerationRequest(prompt="x"))
        self.assertEqual(ctx.exception.status_code, 501)


if __name__ == "__main__":
    unittest.main()
