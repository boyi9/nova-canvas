# ADR 005 — Sprint 2 Day 3：多模态能力开发计划（S1-W3-D2-01）

- **状态**：已批准（Accepted）
- **日期**：2026-08-18
- **作者**：云端 `/plan`
- **关联任务**：S1-W3-D2-01（AI-001 参考图编辑/文本问答/音视频生成能力接入）
- **前置**：ADR 003（纯 stdlib 零依赖）、ADR 004（图像能力已落地）
- **运行时**：Ollama `0.32.14` + 本地 4 款模型（文本能力复用）；音视频默认走 OpenAI/Azure

---

## 1. 开发边界

| 能力 | 路由后端 | 说明 |
|------|----------|------|
| 参考图编辑 | OpenAI `/v1/images/edits`、Ollama `/api/generate`（多模态） | 复用 ADR 004 的 `edit_image()` |
| 文本问答 | 全后端 `chat()` | 复用已有文本对话 |
| 音频生成 | OpenAI `/v1/audio/speech`、Azure `openai/deployments/{m}/audio/speech` | **新增** `generate_audio()` |
| 视频生成 | OpenAI/Azure 暂无公开标准 API | **新增** `generate_video()` 骨架，未配置时显式 501 |

## 2. 依赖约束（硬性）

- ✅ 纯标准库：`urllib` / `json` / `base64` / `dataclasses`
- ✅ 复用 `BaseAdapter._post()` / `_headers()`；音频返回非 JSON，新增 `_post_raw()` 返回字节
- ❌ 禁止引入 `openai` SDK / `pydub` / `moviepy` 等
- ⚠️ 音视频逻辑默认 provider=`openai`/`azure`；Ollama 不支持音视频，调用即 `AdapterError 501` 降级

## 3. 接口规范

```python
@dataclass
class AudioGenerationRequest:
    text: str
    model: str = "tts-1"
    voice: str = "alloy"          # alloy/echo/fable/onyx/nova/shimmer
    response_format: str = "mp3"
    extra: Dict[str, Any] = field(default_factory=dict)

@dataclass
class AudioGenerationResponse:
    id: str
    model: str
    audio_b64: str                # base64 编码的音频字节

@dataclass
class VideoGenerationRequest:
    prompt: str
    model: str = ""
    duration_sec: int = 5
    extra: Dict[str, Any] = field(default_factory=dict)

@dataclass
class VideoGenerationResponse:
    id: str
    model: str
    video_url: str                # 或 b64；骨架阶段返回占位
```

## 4. 与现有架构对齐

| 现有资产 | 复用 |
|----------|------|
| `BaseAdapter._post()` | 音频/视频 JSON 请求复用 |
| `BaseAdapter._post_raw()`（新增） | 音频返回字节（`/v1/audio/speech` 返回音频流非 JSON） |
| `chat()` | 文本问答直接复用 |
| `edit_image()` | 参考图编辑直接复用 |
| `AdapterError` | 音视频 501 / Ollama 不支持统一抛出 |

## 5. 风险与规避（对应风险预判章节）

| 风险 | 规避 |
|------|------|
| 视频 API 成本不可控 | `generate_video()` 骨架默认 501；真实接入须在 S1-W3-D2-02 `circuit_breaker.py` 内做成本熔断（单请求>5s 或月预算>500USD 熔断） |
| Ollama 不支持音视频 | `OllamaAdapter.generate_audio/video` 显式 501，服务层默认 provider 切 OpenAI |
| 音频返回非 JSON | 新增 `_post_raw()` 直接返回 `bytes` 并 base64 编码，避免 `json.loads` 报错 |

## 6. 验收门禁（Day 3 关闭前）

- [ ] `audio.py` / `video.py` / `edit.py` / `chat.py` 服务层经 `build_adapter` 调用，零新依赖
- [ ] 音频 `_post_raw` 正确处理非 JSON 响应
- [ ] `pytest` 全绿，新增方法覆盖率 ≥80%
- [ ] `/sync-board` 标记 `S1-W3-D2-01` = DONE
- [ ] ADR 005 归档
