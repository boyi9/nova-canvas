"""client_test.py — MCP 客户端端到端联调（真实拉起 server + 真实 Ollama）。"""

import json
import unittest

from backend.mcp.client import MCPClient, MCPClientError


class TestMCPClientE2E(unittest.TestCase):
    def setUp(self):
        self.client = MCPClient()

    def tearDown(self):
        self.client.close()

    def test_initialize_and_list(self):
        init = self.client.initialize()
        self.assertEqual(init["result"]["serverInfo"]["name"], "nova-canvas-ai001-mcp")
        tools = self.client.list_tools()
        names = [t["name"] for t in tools]
        self.assertEqual(
            names,
            ["ai_chat", "ai_text_to_image", "ai_image_to_image",
             "ai_edit_image", "ai_text_to_audio", "ai_text_to_video"],
        )

    def test_ai_chat_via_real_ollama(self):
        self.client.initialize()
        result = self.client.call_tool(
            "ai_chat",
            {
                "messages": [{"role": "user", "content": "用中文说一句你好，不超过10个字"}],
                "provider": "ollama",
                "model": "llama3.2:3b",
            },
        )
        self.assertFalse(result.get("isError", False))
        text = result["content"][0]["text"]
        self.assertTrue(len(text) > 0)

    def test_error_propagates_as_exception(self):
        self.client.initialize()
        # 触发一个不存在的工具 -> 服务端返回 error -> 客户端抛异常
        with self.assertRaises(MCPClientError):
            self.client.call_tool("ai_nonexistent", {})


if __name__ == "__main__":
    unittest.main()
