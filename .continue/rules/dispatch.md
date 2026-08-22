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
