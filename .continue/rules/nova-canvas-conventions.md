---
name: Nova Canvas (启画) 项目共享约定
alwaysApply: true
---

# Nova Canvas / 启画 — 与 OpenCode 共用的项目约定（Continue 端）

> 完整权威约定见项目根目录 **AGENTS.md**（OpenCode 自动读取，Continue 可 @AGENTS.md 调出）。
> 本规则为精简版，确保每次对话都注入核心约束。

## 环境（与 OpenCode 完全一致）
- Windows 11 + PowerShell 5.1；本地模型后端 Ollama `http://127.0.0.1:11434`
  （**禁止用 `localhost`**，会解析 IPv6 `::1` 导致 404）。
- 已拉取模型：deepseek-r1:7b、qwen2.5:7b、nemotron-mini:4b、llama3.2:3b、
  nomic-embed-text（embedding）。OpenCode 与 Continue 共用同一后端，模型对称。

## 零依赖（强制）
- `backend/**` 仅用 Python 标准库，不得 `pip install` 任何第三方包（含 `mcp` SDK）。
- 密钥走环境变量，**绝不硬编码**。

## Nova Canvas MCP（已注册 `nova-canvas-ai001`）
6 工具：ai_chat / ai_text_to_image / ai_image_to_image / ai_edit_image /
ai_text_to_audio（熔断）/ ai_text_to_video（熔断）。调用前确认 Ollama 在运行。

## 双端闭环接力（核心）
两工具操作同一份项目文件，文件层实时互通；接力靠**落盘介质**而非聊天历史：
1. **Git 为主轴**：改完即 `git commit`（message 写清做了什么/下一步）；接棒方先 `git log`/`git diff`。
2. **HANDOFF.md 为交接单**：交棒时写、接棒时读。
3. **AGENTS.md 为约定真理源**：架构/约束变更先改这里，两端同步。
4. **看板一致**：任务以 `C:\board-import\` 下 jira/feishu/github 三份 JSON（已统一 11 条）为准。

## 禁止
- 不把聊天历史当已交接；不新增依赖；不硬编码密钥；不用 `localhost` 代替 `127.0.0.1`；
  核心改动未跑通测试不提交。
