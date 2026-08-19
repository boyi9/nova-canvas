# AI-001 适配器设计文档（adapter-design.md）

- **Story**：AI-001 多 OpenAI 兼容接口调度能力
- **Task**：S1-W3-D1-01 OpenAI 兼容接口适配器设计
- **交付物**：`backend/internal/api/v1/adapter.py` + 本文档
- **状态**：骨架完成，待 Week A Day 2+ 接入具体能力（文生图/图生图/音视频）
- **运行时**：本地 Ollama `0.32.14`（已验证，满足 ≥0.3.0 要求）

---

## 1. 设计目标

屏蔽多家模型后端的协议差异（OpenAI / Azure OpenAI / 自建中转站 / 本地 Ollama），
对外暴露**统一且与 OpenAI 兼容**的 `GenerationRequest` / `GenerationResponse` 结构，
使上层 `AI-002` 脚本能力、`AGENT-002` 对话生图无需关心后端实现。

## 2. 架构

```
                ┌─────────────────────────────┐
 上层调用方 ───► │  build_adapter(provider)    │
                │      工厂模式                │
                └───────────┬─────────────────┘
                            │ 返回 BaseAdapter 子类
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
 OpenAIAdapter      AzureAdapter         OllamaAdapter
   /v1/chat/         /openai/deploy-        /api/chat
   completions       ments/{dep}/...        (本地 11434)
```

## 3. 核心抽象

| 类 | 职责 |
|----|------|
| `BaseAdapter` (ABC) | 定义 `chat()` / `chat_stream()` 接口，封装 `_headers()` / `_post()`（标准库 `urllib`，零依赖） |
| `OpenAIAdapter` | 对齐官方 `/v1/chat/completions`，payload 双向转换 |
| `AzureAdapter` | URL 含 `deployments/{model}` + `api-version` 查询参数 |
| `OllamaAdapter` | 对接本地 Ollama `/api/chat`，结构不同于 OpenAI，做响应归一化 |
| `build_adapter()` | 工厂函数，按 `provider` 名实例化，密钥从环境变量读取 |

## 4. 数据结构（对齐 OpenAI 规范）

- `ChatMessage`: `role` / `content` / `name?`
- `GenerationRequest`: `model` / `messages` / `temperature` / `top_p` / `max_tokens` / `stream` / `extra`
- `GenerationResponse`: `id` / `model` / `choices[]` / `usage`

## 5. 合规与约束（见 coding-rules.md）

| 约束 | 落地 |
|------|------|
| **零新增依赖** | 仅用 `urllib` / `json` / `dataclasses` 等标准库，无第三方包 |
| **密钥不硬编码** | `OPENAI_API_KEY` / `AZURE_OPENAI_KEY` 经 `os.environ` 注入 |
| **接口规范** | 请求/响应字段命名对齐 OpenAI REST |
| **MIT 合规** | 无 GPL/AGPL 引入 |

## 6. 流式支持现状

- `OllamaAdapter.chat_stream()` 已实现（逐块 yield content）
- `OpenAIAdapter` / `AzureAdapter` 流式标记为 `NotImplementedError`，
  因标准库 `urllib` 不支持 SSE 流式解析；**后续如需启用，经 ADR 批准引入 `httpx`**

## 7. 后续集成点（Week A Day 2+）

| 能力 | 调用方式 |
|------|----------|
| 文生图 / 图生图 | 在 `BaseAdapter` 新增 `generate_image()` 抽象 |
| 参考图编辑 | 复用 `GenerationRequest.extra` 传 `image_url` |
| 文本问答 | 直接 `chat()` |
| 音频 / 视频生成 | 独立 `BaseMediaAdapter` 子类（见风险预判：成本熔断） |

## 8. 验收对照（来自 sprint2-full-task-guide.md）

- [x] 接口定义符合 OpenAPI 3.0 精神（OpenAI 兼容结构）
- [x] 支持多后端无缝切换（工厂 + 三实现）
- [ ] 单测覆盖率 ≥80%（待 `/gen-test` 补全）
- [ ] 熔断降级（在 S1-W3-D2-02 `circuit_breaker.py` 接入，不在本文件）
