# Nova Canvas (启画)

> ⚠️ **重要声明**：本项目是基于 [infinite-canvas](https://github.com/basketikun/infinite-canvas) (MIT License) 的**独立二次开发项目**（Hard Fork），**不采用**同步上游、共享代码迭代的开发模式。
> 
> - 所有二次开发成果（新增功能、架构重构、AI 能力集成等）归 **Nova Canvas (启画) 项目及贡献者所有**
> - 不会自动将上游 infinite-canvas 的更新同步合并到本项目
> - 不会将本项目的开发成果回流贡献给 infinite-canvas 上游
> - 两者是独立演进的两个项目，仅共享 MIT 许可证下的基础代码遗产
> - 如需了解原始项目最新进展，请直接访问 infinite-canvas 官方仓库

---

## 项目简介

Nova Canvas 是一个面向 AI 创作的开源无限画布工作台，集成 AI 生图、参考图编辑、视频生成、Agent 智能助手、画布编排、对话创作、提示词库与素材管理等能力，支持可视化创作流程与多 Agent 协同工作。

兼容 OpenAI 接口生态，支持 chatgpt2api、grok2api、flow2api、newapi 等渠道接入。

## 核心能力

- **AI 多模态生成**：文生图、图生图、编辑图、文生语音、文生视频
- **智能 Agent 系统**：支持插件扩展、工具调用、记忆管理
- **无限画布编排**：节点式工作流、可视化编排、实时协作
- **本地离线优先**：Ollama 本地模型、零依赖、隐私友好
- **开发者友好**：MCP 标准接入、OpenCode/Continue 双端协同

## 技术栈

- **前端**：React 19 + TypeScript + Vite + TailwindCSS + Ant Design
- **后端**：Go 1.22 + Gin + GORM + Asynq (Redis) + PostgreSQL
- **AI 适配层**：Python 纯标准库实现（OpenAI/Azure/Ollama 三端统一）
- **MCP Server**：JSON-RPC 2.0 over stdio，纯标准库实现

## 快速开始

### 环境要求

- Node.js 18+
- Go 1.22+
- Python 3.11+
- Ollama 0.32+ (本地模型)
- Redis 7+ (任务队列)

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/boyi9/nova-canvas.git
cd nova-canvas

# 前端
cd web && pnpm install && pnpm dev

# 后端
cd ../backend && go run cmd/main.go

# AI 适配层 (Python)
# 依赖已在 backend/requirements.txt 或 pyproject.toml
```

## 许可证

本项目采用 MIT License。详见 [LICENSE](LICENSE)。

本项目基于 [infinite-canvas](https://github.com/basketikun/infinite-canvas) (MIT License) 进行独立二次开发，原始基础代码版权归 basketikun 所有。本项目的所有修改、新增代码、架构设计、文档等衍生成果，版权归 Nova Canvas (启画) 项目及其贡献者所有。

> **再次强调**：这是一个 Hard Fork 独立项目，不与上游 infinite-canvas 同步代码、不共享迭代成果。

## 贡献

欢迎提交 Issue 和 PR！请遵循项目的代码规范和提交规范。

> 注意：PR 仅针对 Nova Canvas 项目本身，不涉及向 infinite-canvas 上游提交。

## 致谢

- [infinite-canvas](https://github.com/basketikun/infinite-canvas) - 提供 MIT 许可的基础画布代码遗产
- 所有为 Nova Canvas 项目做出贡献的开发者