# AGENTS.md — Nova Canvas (启画) 项目共享约定

> 本文件是 **OpenCode 与 VS Code Continue 双端共用的唯一权威约定源**。
> OpenCode 会自动读取本文件；Continue 通过 `.continue/rules/nova-canvas-conventions.mdc`
> 自动注入等效摘要。两工具接力开发时，以此为准，避免上下文漂移。

## 0. 项目定位
- **Nova Canvas / 启画 · AI-001（Sprint 2）**：本地离线优先的多模态 AI 能力层。
- 目标：在断网/私有环境下，用本地 Ollama 模型提供 chat / 文生图 / 图生图 / 编辑图 /
  文生语音（熔断）/ 文生视频（熔断）能力，并通过 MCP 暴露给 IDE 智能体。
- 许可证：**MIT**。所有新增代码必须保持 MIT 兼容、零新增第三方依赖（见 ADR-003）。

## 1. 运行环境（双端一致）
- **操作系统**：Windows 11 + PowerShell 5.1。
- **本地模型后端**：Ollama 0.32.14，固定端点 `http://127.0.0.1:11434`
  （**禁止用 `localhost`**，会解析到 IPv6 `::1` 导致 404/误报"模型不存在"）。
- **资源约束**：`OLLAMA_MAX_LOADED_MODELS=1`、`OLLAMA_KEEP_ALIVE=1m`、
  `OLLAMA_NUM_PARALLEL=1`（已在用户环境变量中设置并作用于运行中的 Ollama）。
  模型空闲 1 分钟后自动卸载，显存占用从 ~10.5GB 降至 ~3.4GB。
- **已拉取模型（离线可用）**：
  | title | 模型 | contextLength | 用途 |
  |-------|------|---------------|------|
  | deepseek-r1 | deepseek-r1:7b | 32768 | 推理/复杂任务 |
  | qwen2.5-coder | qwen2.5:7b | 32768 | 代码生成/编辑 |
  | qwen2.5 | qwen2.5:7b | 32768 | 通用对话 |
  | nemotron-mini | nemotron-mini:4b | 8192 | 轻量/补全/tab |
  | llama3.2 | llama3.2:3b | 8192 | 极速轻量 |
  | (embedding) | nomic-embed-text | — | 代码检索/上下文 |
- **双端协同基础**：OpenCode 经 `backend/internal/api/v1/adapter.py` 调用同一 Ollama；
  Continue 直连同一端点。模型权重与离线状态完全一致 → 产出能力对称。

## 2. 零依赖约束（强制）
- 所有 `backend/**` 代码（adapter / service / mcp / circuit_breaker / cost_metrics）
  **仅使用 Python 标准库**，不得 `pip install` 任何第三方包（包括 `mcp` SDK、
  `requests`、`pydantic` 等）。
- MCP Server 为手写 JSON-RPC 2.0 over stdio，不依赖官方 `mcp` PyPI 包。
- 密钥/Key 一律走环境变量（`OPENAI_API_KEY` / `AZURE_OPENAI_KEY` / `OLLAMA_IMAGE_MODEL`），
  **绝不硬编码**。

## 3. Nova Canvas MCP 工具（双端通用）
注册名：`nova-canvas-ai001`。6 个工具：
- `ai_chat` — 对话（复用 `BaseAdapter.chat`），参数 `messages/provider/model/temperature/max_tokens`
- `ai_text_to_image` — 文生图（OpenAI/Ollama 多模态）
- `ai_image_to_image` — 图生图（`image_b64` 输入）
- `ai_edit_image` — 参考图编辑（`reference_image_b64` 输入）
- `ai_text_to_audio` — 文生语音（OpenAI/Azure，**带成本熔断**）
- `ai_text_to_video` — 文生视频（OpenAI/Azure，**带成本熔断**，未配置返回 501）
- **调用方式**：OpenCode 侧通过已注册的 MCP `nova-canvas-ai001`；
  Continue 侧通过 `.continue/config.json` 的 `mcpServers.nova-canvas-ai001`
  （`python -m backend.mcp.server`，`PYTHONPATH=D:\nova启画\novacanvas`）。

## 4. 代码风格与提交
- Python：遵循 PEP8，函数/类有 docstring；错误用 `AdapterError` 体系抛出。
- 测试：每个模块配套 `*_test.py`（纯 stdlib `unittest`），目标覆盖率 ≥ 90%。
  跑测试：`python -m unittest discover -s backend -p "*_test.py"`。
- Windows/PowerShell 注意：`mkdir`(非 `mkdir -p`)、`Stop-Process`(非 `pkill`)、
  `Start-Process`、避免 `&&` 链与 `<<<` here-string。

## 5. 双端闭环接力协议（核心）
两工具操作**同一份项目文件**（`D:\nova启画\novacanvas`），文件层实时互通。
接力靠以下"交接介质"，而非聊天历史（聊天框不互通）：
1. **Git 为主轴**：改完即 `git commit`（message 写清"做了什么/下一步"）；
   接棒方先 `git log` / `git diff` 再开工。
2. **HANDOFF.md 为交接单**：交棒时写、接棒时读（模板见 `HANDOFF.md`）。
3. **本文件为约定真理源**：任何架构/约束变更先改这里，两端同步生效。
4. **看板一致性**：任务以 `C:\board-import\` 下 jira/feishu/github 三份 JSON 为准
   （已统一为 11 条），状态变更同步更新。

## 6. 禁止事项
- 禁止把聊天历史当成"已交接"——必须落盘为文件/commit/HANDOFF。
- 禁止新增第三方依赖、禁止硬编码密钥、禁止用 `localhost` 代替 `127.0.0.1`。
- 禁止在未跑通测试的情况下提交核心模块改动。