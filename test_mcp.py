import sys
import json

sys.path.insert(0, r"D:\nova启画\novacanvas")

from backend.mcp.server import MCPServer

server = MCPServer()

# Test initialize
msg = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": {"name": "test", "version": "1.0"}
    }
}

response = server.handle(msg)
print(json.dumps(response, ensure_ascii=False, indent=2))

# Test tools/list
msg2 = {
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
}

response2 = server.handle(msg2)
print(json.dumps(response2, ensure_ascii=False, indent=2))

# Test tools/call - ai_chat
msg3 = {
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
        "name": "ai_chat",
        "arguments": {
            "messages": [{"role": "user", "content": "你好，请简单介绍一下你自己"}],
            "provider": "ollama",
            "model": "qwen2.5:7b",
            "temperature": 0.7,
            "max_tokens": 100
        }
    }
}

response3 = server.handle(msg3)
print(json.dumps(response3, ensure_ascii=False, indent=2))