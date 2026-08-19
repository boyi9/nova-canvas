# Nova Canvas AI-001 — MCP Server 接入文档

纯标准库实现的 MCP stdio Server（**不依赖 `mcp` SDK**），把 AI-001 后端能力以
MCP `tools` 形式暴露给任意 MCP 客户端（IDE / Agent / 前端）。

## 启动

```powershell
cd <repo-root>
python -m backend.mcp.server
```

进程从 stdin 逐行读取 JSON-RPC 2.0 请求，向 stdout 写 JSON 响应。

## 暴露的工具

| Tool | 说明 | 熔断保护 |
|------|------|----------|
| `ai_chat` | 文本问答/对话（Ollama/OpenAI/Azure） | — |
| `ai_text_to_image` | 文本生图 | — |
| `ai_image_to_image` | 图生图 | — |
| `ai_edit_image` | 参考图编辑 | — |
| `ai_text_to_audio` | 文本转语音（默认 OpenAI/Azure） | ✅ circuit_breaker |
| `ai_text_to_video` | 文本转视频（未配置视频服务返回 501） | ✅ circuit_breaker |

音频/视频调用经 `CircuitBreaker` 保护：单请求超时熔断（音频 30s / 视频 60s）、
月度预算上限 500 USD，超限返回 JSON-RPC `error`。

## 在 MCP 客户端注册

以 Claude Desktop / Cursor / OpenCode 风格配置为例（需保证 `PYTHONPATH` 含仓库根，
因为 `backend` 为隐式命名空间包）：

```json
{
  "mcpServers": {
    "nova-canvas-ai001": {
      "command": "python",
      "args": ["-m", "backend.mcp.server"],
      "env": {
        "PYTHONPATH": "<repo-root>",
        "OPENAI_API_KEY": "sk-xxx",
        "AZURE_OPENAI_KEY": "xxx",
        "OLLAMA_KEEP_ALIVE": "1m"
      }
    }
  }
}
```

## 最小协议示例（stdin → stdout）

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"ai_chat","arguments":{"messages":[{"role":"user","content":"你好"}],"provider":"ollama","model":"llama3.2:3b"}}}
```

## 前端封装层（MCPClient SDK）

`backend/mcp/client.py` 提供纯标准库客户端，前端/IDE 可直接调用，无需关心 stdio 细节：

```python
from backend.mcp.client import MCPClient

client = MCPClient()
client.initialize()
tools = client.list_tools()              # 6 个工具
result = client.call_tool("ai_chat", {
    "messages": [{"role": "user", "content": "你好"}],
    "provider": "ollama",
    "model": "llama3.2:3b",
})
print(result["content"][0]["text"])
client.close()
```

端到端联调测试见 `backend/mcp/client_test.py`（`pytest backend/mcp/client_test.py -q`，3 passed）。



## 本地验证

```powershell
python -m pytest backend/mcp/server_test.py -q     # 14 passed, 覆盖率 94%
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python -m backend.mcp.server
```

> 注意：Ollama 适配默认走 `http://127.0.0.1:11434`（非 `localhost`，避免 IPv6 解析到 `::1` 导致 404）。
