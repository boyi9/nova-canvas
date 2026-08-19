# ADR 007 — Sprint 2 Day 4：MCP Server 接入计划（D1 前端接入）

- **状态**：已批准（Accepted）
- **日期**：2026-08-18
- **作者**：云端 `/plan`
- **关联任务**：D1 前端接入（MCP Server 暴露 AI-001 能力）
- **前置**：ADR 003（纯 stdlib）、ADR 005（音视频链路）、ADR 006（circuit_breaker）
- **运行时**：Ollama `0.32.14`；前端/IDE 经 MCP stdio 协议调用

---

## 1. 开发边界

构建一个 **stdio MCP Server**，把 AI-001 后端能力以 MCP `tools` 形式暴露给前端/IDE：

| MCP Tool | 后端实现 | 熔断保护 |
|----------|----------|----------|
| `ai_chat` | `chat.chat()` | 否（轻量） |
| `ai_text_to_image` | `t2i.text_to_image()` | 否 |
| `ai_image_to_image` | `i2i.image_to_image()` | 否 |
| `ai_edit_image` | `edit.edit_image()` | 否 |
| `ai_text_to_audio` | `audio.text_to_audio()` | ✅ circuit_breaker |
| `ai_text_to_video` | `video.text_to_video()` | ✅ circuit_breaker |

## 2. 依赖约束（硬性）

- ✅ **纯标准库实现 MCP 协议**：`json` / `sys` / `os`，手工实现 JSON-RPC 2.0 over stdio
- ❌ **不引入 `mcp` PyPI SDK**（避免新增第三方依赖，与 ADR 003 一致）
- ✅ 复用 `backend.service.*` 与 `circuit_breaker.CircuitBreaker`

## 3. 协议规范（最小化 MCP）

- 传输：stdin 逐行读 JSON-RPC 2.0 请求，stdout 写 JSON 响应
- 支持方法：
  - `initialize` → 返回 serverInfo + capabilities.tools
  - `tools/list` → 返回 6 个 tool（含 name/description/inputSchema）
  - `tools/call` → 入参 `{name, arguments}`，返回 `{content:[{type:"text",text:...}]}`
  - `ping` → `{}`
- 错误：将 `AdapterError` / `CircuitError` 映射为 JSON-RPC `error`（code/message）
- 通知（`notifications/initialized` 等）忽略不回包

## 4. 与现有架构对齐

| 现有资产 | 复用 |
|----------|------|
| `chat.py` / `t2i.py` / `i2i.py` / `edit.py` / `audio.py` / `video.py` | 直接 import 调用 |
| `circuit_breaker.CircuitBreaker` | 包裹 audio/video 高成本调用，`cost_usd` 估算入参 |
| `AdapterError` | 统一异常转换 |

## 5. 风险与规避

| 风险 | 规避 |
|------|------|
| 手工 JSON-RPC 出错 | 抽 `MCPServer.handle(msg)` 纯函数，stdio 循环只做 IO，便于单测 |
| 高成本调用失控 | audio/video 强制走 circuit_breaker（5s 超时 + 500USD 月预算） |
| 进程常驻占资源 | Server 本身无模型加载；模型由 adapter 按需拉起并受 keep_alive 限制 |
| 前端协议不兼容 | 严格按 MCP tool schema 输出，便于后续接官方客户端 |

## 6. 验收门禁（D1 关闭前）

- [ ] `backend/mcp/server.py` 纯 stdlib，`py_compile` 通过
- [ ] `initialize` / `tools/list` / `tools/call` 单测全绿
- [ ] audio/video 经 breaker 熔断路径单测覆盖
- [ ] `pytest` 通过，该模块覆盖率 ≥85%
- [ ] 提供启动方式（`python -m backend.mcp.server`）+ 简短 README 片段
- [ ] `/sync-board` 标记 D1 = DONE
- [ ] ADR 007 归档
