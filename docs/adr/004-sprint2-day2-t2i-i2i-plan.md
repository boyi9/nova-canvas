# ADR 004 — Sprint 2 Day 2：文生图/图生图能力开发计划

- **状态**：已批准（Accepted）
- **日期**：2026-08-18
- **作者**：云端 `/plan`
- **关联任务**：S1-W3-D1-02（AI-001 文生图/图生图能力接入）
- **前置**：ADR 003（纯 stdlib 零依赖适配器已落地）
- **运行时**：本地 Ollama `0.32.14` + 已加载 4 款模型（llama3.2:3b / nemotron-mini:4b / deepseek-r1:7b / qwen2.5:7b）

---

## 1. 开发边界

| 项 | 边界 |
|----|------|
| **做什么** | 在已有 `BaseAdapter` 抽象层上扩展 `generate_image()` / `edit_image()` 两个抽象方法；`OpenAIAdapter` 走 `/v1/images/generations`，`OllamaAdapter` 走 `/api/generate` 多模态接口 |
| **不做什么** | 不引入任何新第三方 HTTP/图像库；不新增模型拉取（完全复用本地 4 款模型）；不实现视频/音频（属 S1-W3-D2-01，后续） |
| **交付物** | `backend/service/t2i.py`、`backend/service/i2i.py`、`adapter.py` 扩展、`adapter_test.py` 增补 |

## 2. 依赖约束（硬性）

- ✅ **纯标准库**：仅 `urllib` / `json` / `base64` / `dataclasses`
- ✅ **复用** `adapter.py` 的 `BaseAdapter._post()` / `_headers()` 基础设施
- ❌ **禁止** `pip install requests/httpx/Pillow/imageio` 等
- ⚠️ Ollama 本地 4 款模型均为**文本/对话模型**，不具备原生生图能力；本骨架中 `OllamaAdapter.generate_image` 会路由到「配置的图像模型」（如后续接入 flux/SD），未配置时返回明确 `AdapterError`，不静默失败

## 3. 接口规范（对齐 OpenAI images 规范）

```python
@dataclass
class ImageGenerationRequest:
    prompt: str
    model: str = ""            # 为空时由 adapter 取默认图像模型
    n: int = 1
    size: str = "1024x1024"
    negative_prompt: str = ""
    reference_image_b64: Optional[str] = None   # i2i 时传入
    extra: Dict[str, Any] = field(default_factory=dict)

@dataclass
class ImageGenerationResponse:
    id: str
    model: str
    created: int
    data: List[Dict[str, str]]   # [{"url": ...} | {"b64_json": ...}]
```

## 4. 与现有架构的对齐点

| 现有资产 | 复用方式 |
|----------|----------|
| `BaseAdapter._post()` | 图像请求直接复用，零改动 |
| `build_adapter(provider)` 工厂 | t2i/i2i 服务层直接调用，无需改工厂 |
| `AdapterError` | 图像能力错误统一抛出，状态码映射一致 |
| `OllamaAdapter.chat_stream()` | 多模态 `/api/generate` 复用同一 urlopen 封装 |

## 5. 风险与规避

| 风险 | 规避 |
|------|------|
| 本地模型无法生图 | `OllamaAdapter` 在未配置图像模型时显式 `AdapterError(status_code=501)`，调用方降级到 OpenAI |
| 大图 base64 内存 | 优先返回 `url`（Ollama 写本地文件返回路径），b64 仅作备选 |
| 接口字段漂移 | t2i.py/i2i.py 仅做参数组装，真实字段映射集中在 adapter，便于单测 mock |

## 6. 验收门禁（Day 2 关闭前）

- [ ] `t2i.py` / `i2i.py` 经 `build_adapter` 调用，零新依赖
- [ ] `pytest` 全绿，新增图像方法覆盖率 ≥80%
- [ ] 单测 mock `urllib`，覆盖 OpenAI 成功 / Ollama 未配置图像模型 501 / 错误路径
- [ ] `/sync-board` 标记 `S1-W3-D1-02` = DONE
- [ ] ADR 004 归档
