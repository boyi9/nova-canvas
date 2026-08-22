---
name: 任务分派规则（Task Dispatch Rules）
alwaysApply: true
---

# 任务分派 → 执行模型 路由表

所有分派给本地 Continue 的 nova-canvas(启画) 项目任务，按下表自动选择执行模型与命令（在 Continue 中以 `/命令名` 触发即视为“分派”）：

| 任务类型 | 分派命令 | 执行模型 | 说明 |
|---|---|---|---|
| 基础设施/CI-CD/脚手架 (INFRA-*) | `/dev-infra` | qwen2.5-coder | 代码生成与改造 |
| 画布内核/插件 (CANVAS-*) | `/dev-canvas` | qwen2.5-coder | ts-morph AST 级 |
| Go 后端 API | `/dev-go` | qwen2.5-coder | Gin+GORM |
| 单元测试 | `/dev-test` | qwen2.5-coder | 覆盖率≥80% |
| Agent/prompt/skill | `/dev-agent` | qwen2.5-coder | MCP 约定 |
| 通用修复 | `/fix` | qwen2.5-coder | 带自校验 |
| PR Review（仅分析） | `/review-pr` | deepseek-r1 | 不写文件，纯推理 |
| 后端日志排错 | `/debug-go-log` | qwen2.5-coder | 读日志给方案 |
| 代码解释 | `/explain-code` | qwen2.5 | 说明文档 |
| 看板同步 | `/sync-board` | nemotron-mini | 轻量脚本 |
| PowerShell/JSON | `/fix-powershell-json` | nemotron-mini | 轻量 |
| 本地环境校验 | `/run-local-verify` | (command) | GPU Runner |

## 分派原则

- **任何“写文件”的任务 → `qwen2.5-coder`**（本地模型中工具调用最可靠，能真实落盘）。
- **纯推理/评审且不写文件 → `deepseek-r1`**（仅用于分析，不得用于编辑）。
- **轻量脚本/格式化 → `nemotron-mini`**。
- 所有写文件任务**必须遵守 verify-edits 规则**：写后回读 + grep 校验，确认生效后才汇报完成。
- 与 OpenCode 接力时，改动须 `git status`/`git diff` 自查并 commit，确保同步到 GitHub 形成统一交付。

## OpenCode → Continue 分派标注规范

OpenCode 在把任务分派给 Continue 时，**必须在任务描述中显式标注使用的命令与模型**，Continue 侧无需自行判断，直接按标注执行。标注格式：

> 【Continue 执行】命令：`/dev-canvas`　模型：qwen2.5-coder
> 任务：<具体描述>

速查（分派时照抄对应行）：
- 写文件类 → `/dev-infra` · `/dev-canvas` · `/dev-go` · `/dev-test` · `/dev-agent` · `/fix`　（模型 qwen2.5-coder）
- 纯评审 → `/review-pr`　（模型 deepseek-r1，不写文件）
- 代码解释 → `/explain-code`　（模型 qwen2.5）
- 轻量脚本 → `/sync-board` · `/fix-powershell-json`　（模型 nemotron-mini）

目的：双端（OpenCode / Continue）遵循同一张路由表与标注，避免“声称已改实际未改”，并保证落盘后统一 commit 到 GitHub。
