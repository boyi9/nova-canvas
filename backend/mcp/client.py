"""
client.py — 纯标准库 MCP 客户端（前端/IDE 接入封装层）

以子进程方式拉起 MCP Server（stdio JSON-RPC 2.0），为前端提供简洁 SDK：
    client = MCPClient()
    client.initialize()
    tools = client.list_tools()
    result = client.call_tool("ai_chat", {"messages": [...], "provider": "ollama"})

零第三方依赖，仅用 subprocess / json / os / sys。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Any, Dict, List, Optional

_REPO_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)


class MCPClientError(Exception):
    """MCP 客户端调用异常（含服务端返回的 error）。"""


class MCPClient:
    def __init__(
        self,
        server_cmd: Optional[List[str]] = None,
        pythonpath: Optional[str] = None,
        timeout: float = 60.0,
    ) -> None:
        self.timeout = timeout
        if server_cmd is None:
            server_cmd = [sys.executable, "-m", "backend.mcp.server"]
        env = dict(os.environ)
        env["PYTHONPATH"] = pythonpath or _REPO_ROOT
        self.proc = subprocess.Popen(
            server_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            env=env,
            text=True,
            bufsize=1,
        )
        self._next_id = 1

    def _request(self, method: str, params: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        msg_id = self._next_id
        self._next_id += 1
        msg: Dict[str, Any] = {"jsonrpc": "2.0", "id": msg_id, "method": method}
        if params is not None:
            msg["params"] = params
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line.strip():
            return None
        return json.loads(line)

    def initialize(self) -> Dict[str, Any]:
        resp = self._request("initialize", {})
        # 发送 initialized 通知（无需回包）
        self.proc.stdin.write(
            json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n"
        )
        self.proc.stdin.flush()
        return resp or {}

    def list_tools(self) -> List[Dict[str, Any]]:
        resp = self._request("tools/list")
        return (resp or {}).get("result", {}).get("tools", [])

    def call_tool(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        resp = self._request("tools/call", {"name": name, "arguments": arguments})
        if resp is None:
            raise MCPClientError("服务端无响应")
        if "error" in resp:
            raise MCPClientError(resp["error"].get("message", str(resp["error"])))
        return resp.get("result", {})

    def close(self) -> None:
        try:
            self.proc.stdin.close()
        except Exception:
            pass
        try:
            self.proc.terminate()
        except Exception:
            pass


__all__ = ["MCPClient", "MCPClientError"]
