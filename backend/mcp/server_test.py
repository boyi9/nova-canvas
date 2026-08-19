"""server_test.py — MCP Server 协议与工具分发单测（纯标准库）。"""

import io
import json
import unittest
from unittest import mock

from backend.mcp.server import MCPServer, _AUDIO_BREAKER, _VIDEO_BREAKER
from backend.service.circuit_breaker import BudgetExceededError
from backend.internal.api.v1.adapter import AdapterError, GenerationResponse, ChatMessage


def _resp(content):
    return {"content": [{"type": "text", "text": content}], "isError": False}


class TestProtocol(unittest.TestCase):
    def setUp(self):
        self.srv = MCPServer()

    def test_initialize(self):
        msg = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
        r = self.srv.handle(msg)
        self.assertEqual(r["result"]["serverInfo"]["name"], "nova-canvas-ai001-mcp")
        self.assertIn("tools", r["result"]["capabilities"])

    def test_tools_list_six_tools(self):
        msg = {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}
        r = self.srv.handle(msg)
        names = [t["name"] for t in r["result"]["tools"]]
        self.assertEqual(
            names,
            ["ai_chat", "ai_text_to_image", "ai_image_to_image",
             "ai_edit_image", "ai_text_to_audio", "ai_text_to_video"],
        )

    def test_ping(self):
        r = self.srv.handle({"jsonrpc": "2.0", "id": 3, "method": "ping"})
        self.assertEqual(r["result"], {})

    def test_notification_no_response(self):
        r = self.srv.handle({"jsonrpc": "2.0", "method": "notifications/initialized"})
        self.assertIsNone(r)

    def test_unknown_method_error(self):
        r = self.srv.handle({"jsonrpc": "2.0", "id": 4, "method": "bogus"})
        self.assertEqual(r["error"]["code"], -32601)


class TestToolDispatch(unittest.TestCase):
    def setUp(self):
        self.srv = MCPServer()

    def test_ai_chat(self):
        fake = GenerationResponse(
            id="x", model="llama3.2:3b", choices=[{"message": {"role": "assistant", "content": "hi there"}}]
        )
        with mock.patch("backend.mcp.server.chat_svc.chat", return_value=fake):
            r = self.srv.handle({
                "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                "params": {"name": "ai_chat", "arguments": {"messages": [{"role": "user", "content": "hi"}]}},
            })
        self.assertEqual(r["result"]["content"][0]["text"], "hi there")

    def test_ai_text_to_image(self):
        fake = mock.MagicMock()
        fake.__dict__ = {"id": "i", "model": "dall-e-3", "created": 0, "data": [{"b64_json": "AAA"}]}
        with mock.patch("backend.mcp.server.t2i_svc.text_to_image", return_value=fake):
            r = self.srv.handle({
                "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                "params": {"name": "ai_text_to_image", "arguments": {"prompt": "a cat"}},
            })
        self.assertIn("AAA", r["result"]["content"][0]["text"])

    def test_ai_edit_image(self):
        fake = mock.MagicMock()
        fake.__dict__ = {"id": "e", "model": "dall-e-2", "created": 0, "data": [{"b64_json": "BBB"}]}
        with mock.patch("backend.mcp.server.edit_svc.edit_image", return_value=fake):
            r = self.srv.handle({
                "jsonrpc": "2.0", "id": 3, "method": "tools/call",
                "params": {"name": "ai_edit_image", "arguments": {"reference_image_b64": "R", "prompt": "blue"}},
            })
        self.assertIn("BBB", r["result"]["content"][0]["text"])

    def test_ai_image_to_image(self):
        fake = mock.MagicMock()
        fake.__dict__ = {"id": "i2", "model": "dall-e-3", "created": 0, "data": [{"b64_json": "CCC"}]}
        with mock.patch("backend.mcp.server.i2i_svc.image_to_image", return_value=fake):
            r = self.srv.handle({
                "jsonrpc": "2.0", "id": 4, "method": "tools/call",
                "params": {"name": "ai_image_to_image", "arguments": {"image_b64": "X", "prompt": "y"}},
            })
        self.assertIn("CCC", r["result"]["content"][0]["text"])

    def test_ai_text_to_audio_breaker_budget_exceeded(self):
        with mock.patch.object(
            _AUDIO_BREAKER, "call", side_effect=BudgetExceededError("over budget")
        ):
            r = self.srv.handle({
                "jsonrpc": "2.0", "id": 5, "method": "tools/call",
                "params": {"name": "ai_text_to_audio", "arguments": {"text": "hi", "cost_usd": 999}},
            })
        self.assertEqual(r["error"]["code"], -32000)
        self.assertIn("over budget", r["error"]["message"])

    def test_ai_text_to_video_breaker_open(self):
        with mock.patch.object(
            _VIDEO_BREAKER, "call", side_effect=AdapterError("circuit open", status_code=503)
        ):
            r = self.srv.handle({
                "jsonrpc": "2.0", "id": 6, "method": "tools/call",
                "params": {"name": "ai_text_to_video", "arguments": {"prompt": "a clip"}},
            })
        self.assertEqual(r["error"]["code"], -32000)

    def test_unknown_tool_error(self):
        r = self.srv.handle({
            "jsonrpc": "2.0", "id": 7, "method": "tools/call",
            "params": {"name": "ai_nonexistent", "arguments": {}},
        })
        self.assertEqual(r["error"]["code"], -32000)
        self.assertIn("未知工具", r["error"]["message"])

    def test_adapter_error_maps_to_rpc_error(self):
        with mock.patch(
            "backend.mcp.server.chat_svc.chat",
            side_effect=AdapterError("upstream down", status_code=502),
        ):
            r = self.srv.handle({
                "jsonrpc": "2.0", "id": 8, "method": "tools/call",
                "params": {"name": "ai_chat", "arguments": {"messages": [{"role": "user", "content": "hi"}]}},
            })
        self.assertEqual(r["error"]["code"], -32000)
        self.assertIn("upstream down", r["error"]["message"])

    def test_stdio_loop_e2e(self):
        from backend.mcp import server as srv_mod

        in_data = (
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}) + "\n"
            + json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n"
            + "\n"
        )
        stdin = io.StringIO(in_data)
        stdout = io.StringIO()
        with mock.patch.object(srv_mod.sys, "stdin", stdin), mock.patch.object(
            srv_mod.sys, "stdout", stdout
        ):
            srv_mod._stdio_loop()
        stdout.seek(0)
        lines = [ln for ln in stdout.read().splitlines() if ln.strip()]
        self.assertEqual(len(lines), 1)
        self.assertEqual(json.loads(lines[0])["result"], {})


if __name__ == "__main__":
    unittest.main()
