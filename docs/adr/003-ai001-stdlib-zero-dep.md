# ADR 003 — AI-001 适配器采用纯标准库零依赖方案

- **状态**：已批准（Accepted）
- **日期**：2026-08-18
- **作者**：云端 `/adr`（由 `/review-pr` 审查后归档）
- **关联任务**：S1-W3-D1-01（AI-001 OpenAI 兼容接口适配器设计）
- **关联文档**：`backend/internal/api/v1/adapter.py`、`docs/adapter-design.md`、`docs/sprint2-full-task-guide.md`

---

## 1. 背景与决策

AI-001 需要一套统一适配层，屏蔽 OpenAI / Azure OpenAI / 自建中转站 / 本地 Ollama 的差异。
实现时有两条路线：

- **路线 A**：使用 `httpx` / `requests` 等第三方 HTTP 库，代码更简洁、原生支持 SSE 流式。
- **路线 B**：仅用 Python 标准库（`urllib` / `json` / `dataclasses`），零第三方依赖。

**决策：采用路线 B（纯标准库零依赖）。**

---

## 2. 决策理由

| 维度 | 理由 |
|------|------|
| **MIT 合规** | 项目硬性要求「零新增开源依赖（除非经 ADR 批准）」。标准库天然合规，避免引入任何许可证风险。 |
| **部署复杂度** | 推理代理作为独立 Python 服务，`urllib` 无需 `pip install`，镜像更轻、启动更快。 |
| **供应链安全** | 少一个第三方包 = 少一个供应链攻击面。 |
| **可审计性** | 全部逻辑在仓库内可见，无传递依赖黑洞。 |

---

## 3. 代价与缓解

| 代价 | 缓解方案 |
|------|----------|
| 标准库 `urllib` 不支持 SSE 流式解析 | `OllamaAdapter.chat_stream` 已用逐行 `json.loads` 自行实现；OpenAI/Azure 流式标记为 `NotImplementedError`，待 **另行 ADR 批准引入 `httpx`** 后补全 |
| 请求构造略繁琐 | 已在 `BaseAdapter._post()` 统一封装，上层无感知 |
| 无自动重试/超时池 | 已内置 `timeout=60`；熔断降级将在 S1-W3-D2-02 `circuit_breaker.py` 统一接入 |

---

## 4. 验证结果

| 检查 | 结果 |
|------|------|
| `pytest` 单测 | **15 passed** |
| `coverage` 行覆盖率 | **97%**（缺失行为 3 处 `NotImplementedError` 占位，属预期） |
| 静态审查 `/review-pr` | 通过，无硬编码密钥、无新依赖、接口对齐 OpenAI 规范 |
| 看板同步 `/sync-board` | Jira + 飞书 JSON 已标记 `S1-W3-D1-01 = DONE` |

---

## 5. 后续规则

1. 任何新增第三方依赖（含 `httpx`）**必须**先提 ADR 并经云端批准，禁止本地私自引入。
2. 流式能力启用时，单独发 ADR 记录选型（推荐 `httpx`，MIT 许可）。
3. 适配器错误统一经 `AdapterError` 抛出，状态码映射：上游 4xx→对应码，连接失败→502。

---

## 6. 影响范围

- **上游**：无（独立 Python 服务，不污染 Go Web 后端）
- **下游**：`AI-002` 脚本能力、`AGENT-002` 对话生图可直接 `build_adapter(provider)` 调用
- **配置**：密钥仅经 `OPENAI_API_KEY` / `AZURE_OPENAI_KEY` 环境变量注入
