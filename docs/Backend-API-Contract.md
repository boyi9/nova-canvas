# 后端接口契约（前端已定义，待后端落地 / 确认）

> 用途：把前端 web 已声明并依赖的全部 REST 端点整理为契约，供后端实现与核对。
> 来源：`web/src/services/nova/api.ts` 与 `web/src/sdk/client.ts`（两者端点、请求/响应结构**完全一致**）。
> 前端状态以「Sprint 2 前端交付」实际落地为准标注（见 §3 图例）。
> 未启动后端联调，故「后端状态」以代码可达性判断，需后端确认实际实现度。

## 0. 通用约定

- **Base URL**：`import.meta.env.VITE_API_URL || "/api/v1"`。所有路径均相对此 base（前端常量 `API_BASE`）。
- **鉴权**：请求头 `Authorization: Bearer <token>`，token 取自 `localStorage.nova_token`。`/auth/*` 等无需登录的端点除外。
- **错误包络**：HTTP 非 2xx 时返回
  ```json
  { "error": { "code": number, "message": string, "detail"?: string } }
  ```
  前端 `request()` 按 `body.error` 解析（`NovaApiError` 暴露 `code` / `message` / `detail`）。注意字段名是 `error`（不是 `detail`）。
- **内容类型**：`application/json`（文件上传除外，见 §4 P0-2）。
- **JSON 约定**：时间/布尔按标准 JSON；枚举字符串见各端点。

## 1. 异步生成任务统一契约（关键）

所有生成类端点（`/generate/image`、`/generate/video`、`/generate/style-transfer`）采用**统一的异步任务范式**：

- **发起** `POST` 立即返回：
  ```json
  { "task_id": "string", "status": "string", "credits": number }
  ```
- **轮询** `GET /generate/status/{task_id}` 返回：
  ```json
  {
    "task_id": "string",
    "type": "string",
    "status": "pending" | "success" | "failed",
    "result_url"?: "string",
    "error"?: "string"
  }
  ```
- **前端行为**：`pollGenerationStatus(taskId)` 以 2s 间隔轮询至终态（`success` / `failed`）或 120s 超时；终态为 `success` 时取 `result_url`，为 `failed` 时取 `error`。
- **后端要求**：
  - `status` 必须使用 **`pending` / `success` / `failed`** 三值（前端据此分支，拼写须完全一致）。
  - `result_url` 必须是**公网可访问**的 URL（风格迁移 / 图生图需后端能抓取传入的图片 URL，见 §4 P0-2 媒体托管）。
  - `/generate/status/{task_id}` 在任务生命周期内必须可查（任务完成后建议保留一段时间供重试）。

## 2. 端点目录（按域）

图例见 §3。下表「前端状态」含义：✅ 已联调 / 🟡 契约已定义（前端已调用或 SDK 已包含，待后端）/ ⚪ 未接。

### 2.1 鉴权 Auth

| 方法 | 路径 | 请求 | 响应 | 前端状态 |
|------|------|------|------|----------|
| POST | `/auth/register` | `{ email, password, name }` | `{ user, token }` | 🟡 |
| POST | `/auth/login` | `{ email, password }` | `{ user, token }` | 🟡 |

> `token` 即后续所有请求的 Bearer token。

### 2.2 项目 Projects

| 方法 | 路径 | 请求 | 响应 | 前端状态 |
|------|------|------|------|----------|
| GET | `/projects?limit&offset` | — | `{ projects: any[], total }` | 🟡 |
| POST | `/projects` | `{ name, scene, description? }` | `any` | 🟡 |
| PUT | `/projects/{id}` | `{ name?, canvas_data?, status? }` | `any` | 🟡 |
| DELETE | `/projects/{id}` | — | `{ message }` | 🟡 |

### 2.3 模板 Templates

| 方法 | 路径 | 请求 | 响应 | 前端状态 |
|------|------|------|------|----------|
| GET | `/templates?limit&offset&category?` | — | `{ templates: any[], total }` | 🟡 |

### 2.4 生成 Generation（异步，见 §1）

| 方法 | 路径 | 请求 | 响应（发起） | 前端状态 |
|------|------|------|------|----------|
| POST | `/generate/image` | `{ prompt, width?, height?, style?, plan? }` | `{ task_id, status, credits }` | 🟡 |
| POST | `/generate/video` | `{ prompt, duration?, style? }` | `{ task_id, status, credits }` | 🟡 |
| POST | `/generate/style-transfer` | `{ image_url, style, strength?=0.75 }` | `{ task_id, status, credits }` | ✅ 已联调（风格迁移 UI） |
| GET | `/generate/status/{taskId}` | — | `{ task_id, type, status, result_url?, error? }` | ✅ 已联调（轮询） |

### 2.5 合规 Compliance

| 方法 | 路径 | 请求 | 响应 | 前端状态 |
|------|------|------|------|----------|
| POST | `/compliance/check` | `{ text }` | `{ is_valid, violations: [{ keyword, category, suggestion }], score }` | ✅ 已联调（前端合规检测） |
| POST | `/compliance/check-batch` | `{ texts: string[] }` | `{ results: [{ text, is_valid, violations, score }] }` | 🟡 |

### 2.6 配方 / 工作流 Recipes & Workflows

| 方法 | 路径 | 请求 | 响应 | 前端状态 |
|------|------|------|------|----------|
| GET | `/recipes` | — | `{ recipes: Recipe[] }` | 🟡 |
| POST | `/recipes` | `{ recipe }` | `Recipe` | 🟡 |
| POST | `/recipes/{id}/apply` | `{ values? }` | `{ graph }` | 🟡 |
| POST | `/workflows/run` | `{ nodes, edges, variables? }` | `WorkflowRunResponse` | 🟡 |

### 2.7 Agent 对话

| 方法 | 路径 | 请求 | 响应 | 前端状态 |
|------|------|------|------|----------|
| POST | `/agent/chat` | `{ messages: [{ role: "user"\|"assistant", content }], scene }` | `{ reply: string }` | 🟡（需升级流式，见 §4 P1-3） |

> 前端 `SceneWorkbench.handleAgentMessage` 当前为 `console.log` TODO，待 Agent 后端 + 流式协议。

### 2.8 AI 能力（核心业务）

| 方法 | 路径 | 请求 | 响应 | 前端状态 |
|------|------|------|------|----------|
| GET | `/ai/providers` | — | `{ providers: AIProvider[] }`（`AIProvider`: `id,name,kind,base_url,model,enabled`） | 🟡 |
| POST | `/ai/chat` | `{ provider, messages }` | `{ reply, provider }` | 🟡 |
| POST | `/ai/batch-image` | `{ prompt, count?, style? }` | `{ images: BatchImageResult[] }`（`BatchImageResult`: `id,url,prompt,model`） | ✅ 已联调（首页电商一键生成） |
| POST | `/ai/video` | `{ prompt?, duration?, shots?, style?, voiceover?, music? }` | `VideoCompositionResult`（`id,status,url,duration,voiceover,music,shots:[{index,prompt,image_url,duration}]`） | 🟡 |
| POST | `/ai/fission` | `{ reference, count? }` | `FissionResult`（`id,status,reference,count,variants:[{index,hook,rhythm,shot,copy}]`） | 🟡（前端裂变查看+写回已联调，依赖真实 variants） |
| POST | `/ai/ad-script` | `{ brief, style?, duration? }` | `AdScriptResult`（`id,status,brief,style,scenes:[{shot,visual,voiceover,duration}]`） | ✅ 已联调（首页广告一键生成） |
| POST | `/ai/drama` | `{ synopsis, episodes? }` | `DramaResult`（`id,status,synopsis,characters,episodes:[{index,title,outline,scenes:string[]}]`） | 🟡 |

### 2.9 脚本 Scripts（沙箱执行）

| 方法 | 路径 | 请求 | 响应 | 前端状态 |
|------|------|------|------|----------|
| GET | `/scripts` | — | `{ scripts: ScriptDef[] }` | 🟡 |
| POST | `/scripts` | `{ name, config: ScriptConfig }` | `ScriptDef` | 🟡 |
| POST | `/scripts/{id}/run` | `{}` | `ScriptExecutionResult`（`task_id,status,exit_code,output,error,duration_ms,result?`） | 🟡（前端脚本 UI+权限流已联调） |
| POST | `/scripts/run` | `ScriptConfig` | `ScriptExecutionResult` | 🟡（前端脚本 UI+权限流已联调） |

> `ScriptConfig` 含 `language, source, args?, env?, permissions?, limits?{max_memory_mb,max_cpu_percent,max_execution_time,max_output_size}, working_dir?`。
> 前端已落地：iframe 沙箱加载器 `plugin-iframe-loader.ts`、权限弹窗、示例脚本（生图/批量/分镜）。**后端必须真实在受限沙箱中执行并返回 `ScriptExecutionResult`**。

## 3. 前端状态图例

- ✅ **已联调**：前端真实调用并按上述结构消费返回（本轮交付验证）。
- 🟡 **契约已定义**：`api.ts` / `sdk/client.ts` 已声明并（部分）调用，UI 已就绪，待后端实现/确认。
- ⚪ **未接**：契约存在但当前前端未使用（如有，单独注明）。

## 4. 后端待办（按优先级）

### P0（阻塞前端核心可用）

1. **多模型路由与密钥管理**
   - `GET /ai/providers` 真实返回可用模型列表（含 `base_url` / `model` / `enabled`）。
   - `POST /ai/chat` 按 `provider` 路由到对应端点，处理密钥、余额、限流、失败降级。
   - 前端 AIProvider 选择器已就绪，接通即可用。

2. **媒体托管上传（解锁本地文件）**
   - 新增 `POST /media/upload`（multipart/form-data，字段 `file`）→ `{ url, storageKey, width, height, bytes, mimeType }`，`url` 须公网可访问。
   - **为什么必须**：当前前端 `uploadImage` 仅写本地 IndexedDB 并返回 `blob:` URL，后端不可抓取，导致风格迁移 / 图生图只能用「公网可达 URL」。此端点是「本地上传」落地的前置依赖。

### P1（核心体验闭环）

3. **Agent 流式**
   - `POST /agent/chat` 升级为 SSE（`text/event-stream`），逐段返回 `reply` 增量。
   - 前端 `SceneWorkbench.handleAgentMessage` 当前为 `console.log` TODO，需配套改造为流式渲染。

4. **裂变与短视频「真出片」**
   - 确认 `POST /ai/fission` 真实产出 `variants`（建议每个 variant 附带 `image_url`，便于前端一键写回画布节点）。
   - 确认 `POST /ai/video` 真实合成视频并返回可播放 `url`。
   - 前端已接「查看 + 写回画布」，需后端保证实际产出。

5. **脚本沙箱后端**
   - 真实执行 `POST /scripts/run` 与 `POST /scripts/{id}/run`，在受限沙箱中运行，返回 `ScriptExecutionResult`（含 stdout / `exit_code`）。
   - 前端已接 UI 与权限流（请求/授予权限弹窗）。

### P2（增强 / 商业化）

6. **支付 / 会员**：新增 `/billing/*`、`/membership/*`（订单、权益、支付网关回调）。前端 membership UI 为桩，需后端契约。
7. **PSD 源文件导出**：新增 `POST /export/psd`（后端用 `ag-psd` 或渲染服务生成 `.psd` 二进制）。前端当前仅 SVG / PPTX / 剪映草稿。
8. **项目持久化**：`/projects/*` 与画布 `canvas_data` 落库（当前可能仅本地存储）。

## 5. 联调前置建议

- 提供 `VITE_API_URL`（或本地 `/api/v1` 反代）与 `nova_token` 下发方式（登录返回 token，前端自动写入 `localStorage.nova_token`）。
- 建议实现顺序：**§1 异步任务范式 → §2.8 AI 能力 → §4 P0**；完成后即可联调前端全部「✅ 已联调」项（风格迁移、首页电商/广告一键生成、合规检测、裂变写回、脚本）。

## 6. 已知约束 / 风险

- 风格迁移 / 图生图传入的图片 URL **必须后端可抓取**；本地上传依赖 §4 P0-2 媒体托管。
- 所有生成端点为异步轮询；前端不等待 POST 直接返回，必须保证 `/generate/status/{id}` 在任务生命周期内可用且 `status` 使用 `pending`/`success`/`failed`。
- 错误包络字段名为 `error`（非 `detail`），前端据此解析。
- 前端单元测试已覆盖：风格迁移轮询（`style-transfer.test.ts`）、首页结果映射（`generate-result.test.ts`）、SVG/PPTX 导出、裂变节点构建、脚本沙箱加载；联调时可作为回归基线。
