# Sprint 2 — AI-001 后端能力 复盘（Day 1 ~ Day 4）

> 状态：**AI-001 后端 + D1 MCP 接入全部完成**，纯标准库零新增依赖，全量单测通过。

## 交付清单

| 日期 | 任务 | 交付物 | 看板 |
|------|------|--------|------|
| Day 1 | S1-W3-D1-01 | `adapter.py` OpenAI 兼容适配骨架（chat / 图像） | DONE |
| Day 1 | S1-W3-D1-02 | `t2i.py` / `i2i.py` + `generate_image`/`edit_image` | DONE |
| Day 3 | S1-W3-D2-01 | `edit.py`/`chat.py`/`audio.py`/`video.py` 多模态服务层 | DONE |
| Day 3 | S1-W3-D2-02 | `circuit_breaker.py` 成本熔断（超时/失败/预算） | DONE |
| Day 4 | S1-W3-D4-01 | `mcp/server.py` MCP stdio 接入（6 工具） | DONE |

## 架构全景

```
前端/IDE (MCP Client)
   │  JSON-RPC 2.0 over stdio
   ▼
backend/mcp/server.py        ← 纯标准库，无 mcp SDK
   │  6 tools: ai_chat / ai_text_to_image / ai_image_to_image
   │           / ai_edit_image / ai_text_to_audio* / ai_text_to_video*
   ▼
backend/service/*            ← chat / t2i / i2i / edit / audio / video
   │  circuit_breaker.CircuitBreaker（audio/video 走熔断）
   ▼
backend/internal/api/v1/adapter.py   ← BaseAdapter + OpenAI/Azure/Ollama
   │
   ▼
OpenAI / Azure / Ollama(127.0.0.1:11434)
```

## ADR 索引

- `002-sprint2-plan.md` — Sprint 2 总计划
- `003-ai001-stdlib-zero-dep.md` — 纯标准库零依赖约束
- `004-sprint2-day2-t2i-i2i-plan.md` — t2i/i2i 计划
- `005-sprint2-day3-multimodal-plan.md` — 多模态计划
- `006-sprint2-day3-circuit-breaker-plan.md` — 成本熔断计划
- `007-sprint2-day4-mcp-server-plan.md` — MCP Server 计划

## 关键约束（贯穿全程）

- ✅ **零新增第三方依赖**：adapter / service / circuit_breaker / mcp 全部纯标准库
- ✅ **Ollama 0.32.14 兼容**：4 款文本模型可直接复用；音视频默认走 OpenAI/Azure
- ✅ **资源纪律**：`OLLAMA_MAX_LOADED_MODELS=1` + `OLLAMA_KEEP_ALIVE=1m` + `OLLAMA_NUM_PARALLEL=1`
- ⚠️ **已知 bug 修复**：Ollama 适配默认 `base_url` 由 `localhost` 改为 `127.0.0.1`
  （本机 `localhost` 解析到 IPv6 `::1` → Ollama 404，表现为「model not found」）

## 验证命令

```powershell
# 全量单测（adapter + circuit_breaker + mcp）
python -m pytest backend/internal/api/v1/adapter_test.py backend/service/circuit_breaker_test.py backend/mcp/server_test.py -q
# 端到端 stdio 冒烟
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python -m backend.mcp.server
# 真实链路（直连 Ollama）
python -c "from backend.mcp.server import MCPServer; s=MCPServer(); print(s.handle({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'ai_chat','arguments':{'messages':[{'role':'user','content':'hi'}],'provider':'ollama','model':'llama3.2:3b'}}})['result']['content'][0]['text'])"
```

## 下一步建议

1. **Plugin 封装层**：把 MCP server 接到具体宿主（OpenCode 插件 / Web 前端调用封装）
2. **真实客户端联调**：在 IDE 注册 MCP server，跑一次真实 `ai_chat`
3. **成本可视化**：circuit_breaker 预算埋点接入监控/看板
