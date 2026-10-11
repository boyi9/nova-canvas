# P2 API Reference - Collaboration / Audio / Game Assets

> 本文档覆盖 Nova Canvas P2 阶段的 43 个后端接口。
> 准确性由 `tests/test_docs_coverage.py` 守护：文档中的每个端点都会与 FastAPI OpenAPI schema 比对，
> 实现新增或删除端点而文档未同步时测试会失败。

## 通用约定

| 项 | 值 |
|---|---|
| Base URL（开发） | `http://localhost:8000` |
| 交互式文档 | `http://localhost:8000/api/docs`（Swagger） |
| OpenAPI JSON | `http://localhost:8000/api/openapi.json` |
| 请求体格式 | `application/json` |
| 认证头 | `Authorization: <token>`（协作接口必填；`401` 表示未登录，`403` 表示已登录但无权限） |

**RBAC 角色**：`owner` > `editor` > `viewer`。

**权限常量**：共 12 项，定义于 `web/backend/collab/permissions.py#Permission`，采用 `域:动作` 命名：

| 权限 | viewer | editor | owner |
|---|:---:|:---:|:---:|
| `project:read` | ✅ | ✅ | ✅ |
| `version:read` | ✅ | ✅ | ✅ |
| `project:write` | — | ✅ | ✅ |
| `version:create` | — | ✅ | ✅ |
| `approval:submit` | — | ✅ | ✅ |
| `project:delete` | — | — | ✅ |
| `member:manage` | — | — | ✅ |
| `share:manage` | — | — | ✅ |
| `version:rollback` | — | — | ✅ |
| `approval:review` | — | — | ✅ |
| `schedule:manage` | — | — | ✅ |
| `publish:execute` | — | — | ✅ |

**红线权限**（3 项）：`project:delete`、`publish:execute`、`member:manage`。
即删除项目、执行发布、增删改成员——这三类操作即便自动化链路可达，也必须人工确认。

> **"所需权限"列的两种含义**：
> - 写具体权限名（如 `member:manage`）→ 需要该角色具备此权限
> - 写"仅需为项目成员"→ 代码只校验 `_role()` 成员身份，不检查特定权限（viewer 也能读）

---

## 1. Collaboration API `/api/collab`

### 1.1 成员管理

| Method | Endpoint | 说明 | 所需权限 |
|---|---|---|---|
| `GET` | `/api/collab/{project_id}/members` | 成员列表 | 仅需为项目成员 |
| `POST` | `/api/collab/{project_id}/members` | 添加成员 **（红线）** | `member:manage` |
| `PATCH` | `/api/collab/{project_id}/members/{member_id}` | 调整成员角色 **（红线）** | `member:manage` |
| `DELETE` | `/api/collab/{project_id}/members/{member_id}` | 移除成员 **（红线）** | `member:manage` |

```http
POST /api/collab/prj_001/members
Authorization: <owner_token>
Content-Type: application/json

{
  "user_id": "user_42",
  "role": "editor"          // owner | editor | viewer
}
```

```json
// 200
{ "user_id": "user_42", "role": "editor", "invited_at": 1756000000.0 }

// 400 非法角色
{ "detail": "非法角色: admin" }

// 403 权限不足
{ "detail": "角色 'viewer' 缺少权限 'member:manage'" }
```

**约定**：项目创建者自动成为 `owner`，否则首个成员永远无法被添加（`MEMBER_MANAGE` 需要已存在 owner）——这是启动死锁规避。

### 1.2 分享链接

| Method | Endpoint | 说明 | 所需权限 |
|---|---|---|---|
| `GET` | `/api/collab/{project_id}/shares` | 分享链接列表 | 仅需为项目成员 |
| `POST` | `/api/collab/{project_id}/shares` | 创建分享链接 | `share:manage` |
| `DELETE` | `/api/collab/{project_id}/shares/{share_id}` | 撤销分享链接 | `share:manage` |
| `GET` | `/api/collab/share/{token}` | 凭 token 访问（**免鉴权**） | — |

```http
POST /api/collab/prj_001/shares
Content-Type: application/json

{
  "permission": "viewer",       // viewer | editor
  "expires_in_s": 86400         // 可选，null = 永不过期
}
```

```json
// 200 —— token 只在此处返回一次，请妥善保存
{
  "share_id": "shr_ab12",
  "token": "shr_9f2c1d...",
  "permission": "viewer",
  "expires_at": 1756086400.0,
  "access_count": 0
}
```

**约定**：token 使用常量时间比较防时序攻击；过期链接返回 `404`；撤销后立即失效。

### 1.3 版本历史

| Method | Endpoint | 说明 | 所需权限 |
|---|---|---|---|
| `GET` | `/api/collab/{project_id}/versions` | 版本列表（新→旧） | 仅需为项目成员 |
| `POST` | `/api/collab/{project_id}/versions` | 创建版本快照 | `version:create` |
| `GET` | `/api/collab/{project_id}/versions/{version_id}` | 版本详情 | 仅需为项目成员 |
| `POST` | `/api/collab/{project_id}/rollback` | 回滚到指定版本 **（红线）** | `version:rollback` |

```json
// POST /api/collab/{project_id}/versions
{ "canvas_data": "{\"nodes\":[...]}", "label": "v3 双列布局", "note": "调整首屏" }

// POST /api/collab/{project_id}/rollback
{ "version_id": "ver_001" }
```

**约定**：回滚本身也留痕 —— 先把**当前状态**存为一个新版本，再恢复到目标版本。不会静默丢失改动。

### 1.4 审批流

| Method | Endpoint | 说明 | 所需权限 |
|---|---|---|---|
| `GET` | `/api/collab/{project_id}/approvals` | 审批请求列表 | 仅需为项目成员 |
| `POST` | `/api/collab/{project_id}/approvals` | 提交审批 | `approval:submit` |
| `POST` | `/api/collab/{project_id}/approvals/{request_id}/decision` | 批准/驳回 | `approval:review` |
| `POST` | `/api/collab/{project_id}/approvals/{request_id}/cancel` | 撤销审批 | `approval:submit` |

```json
// POST /api/collab/{project_id}/approvals
{ "title": "618 主图终稿", "kind": "content" }

// POST /api/collab/{project_id}/approvals/{request_id}/decision
{ "approve": true, "comment": "通过，排期投放" }
```

**约定**：状态机为 `pending → approved | rejected | cancelled`；重复裁决**已决**请求返回 `404`（而非 400），因为此时该请求已不属于"待审"集合。

### 1.5 发布排期

| Method | Endpoint | 说明 | 所需权限 |
|---|---|---|---|
| `GET` | `/api/collab/{project_id}/schedules` | 排期列表 | 仅需为项目成员 |
| `POST` | `/api/collab/{project_id}/schedules` | 创建排期 | `schedule:manage` |
| `POST` | `/api/collab/{project_id}/schedules/{schedule_id}/cancel` | 取消排期 | `schedule:manage` |
| `POST` | `/api/collab/schedules/{schedule_id}/execute` | 执行发布 **（红线）** | `publish:execute` |

```json
// POST /api/collab/{project_id}/schedules
{
  "channel": "douyin",
  "scheduled_at": 1756100000.0,
  "payload": "{\"title\":\"618 开抢\"}"
}
```

**约定**：
- `scheduled_at` 早于当前时间 → `400`
- 执行**幂等**：同一排期重复执行返回 `409`，防止活动期间重复投放
- 取消已执行的排期 → `409`

> **路径不对称说明（已知取舍）**：`cancel` 带 `{project_id}`，`execute` 不带。
> 原因是 `execute` 由调度 worker 调用，worker 手里只有 `schedule_id`，因此由服务端反查排期所属项目再做授权；
> 而 `cancel` 由用户在项目上下文中触发，天然带 project 上下文。
> 两者的授权校验都真实生效，只是 URL 形状不同。新代码请按上表路径调用，不要自行"矫正"。

### 1.6 Presence（实时协同）

| Method | Endpoint | 说明 | 所需权限 |
|---|---|---|---|
| `GET` | `/api/collab/{project_id}/presence` | 在线成员/光标/输入状态 | 仅需为项目成员 |
| `POST` | `/api/collab/{project_id}/presence/join` | 加入项目 | 仅需为项目成员 |
| `POST` | `/api/collab/{project_id}/presence/leave` | 离开项目 | 仅需为项目成员 |
| `POST` | `/api/collab/{project_id}/presence/typing` | 设置输入指示 | 仅需为项目成员 |
| `POST` | `/api/collab/{project_id}/presence/cursor` | 更新光标位置 | 仅需为项目成员 |

```json
// GET /api/collab/{project_id}/presence
{
  "online": [
    {
      "user_id": "user_1",
      "session_id": "ses_a1",
      "cursor": { "x": 100.0, "y": 200.0, "zoom": 1.5 },
      "typing": false,
      "joined_at": 1756000000.0,
      "last_active_at": 1756000100.0
    }
  ],
  "count": 1
}

// POST /api/collab/{project_id}/presence/cursor
{ "x": 100.0, "y": 200.0, "zoom": 1.5 }
```

**约定**：join 前调用 cursor/typing 返回 `404`；同一用户重复 join 会创建新会话。

**当前局限**：presence 为 REST 轮询实现，非 WebSocket 推送。多人光标实时性要求高的场景需替换为 WebSocket 传输（`PresenceBus` 已抽象事件发射，替换传输层即可，业务代码无需改动）。

---

## 2. Audio API `/api/audio`

### 2.1 目录查询

| Method | Endpoint | 说明 |
|---|---|---|
| `GET` | `/api/audio/catalog` | 音色 / BGM / 音效目录（支持按 `lang` / `mood` / `category` 过滤） |

```http
GET /api/audio/catalog?lang=zh-CN&mood=轻快
```

```json
{
  "voices": [
    { "id": "zh_female_warm", "name": "晓晓（女声·温暖）", "gender": "female",
      "lang": "zh-CN", "style": "口播", "sample_rate": 24000 }
  ],
  "bgm": [
    { "id": "bgm_upbeat_pop", "name": "轻快流行", "mood": "轻快", "bpm": 120,
      "duration_s": 92.0, "tags": ["电商", "口播"] }
  ],
  "sfx": [
    { "id": "sfx_ui_success", "name": "成功提示", "category": "ui", "duration_s": 0.7 }
  ]
}
```

### 2.2 任务规划与渲染

| Method | Endpoint | 说明 |
|---|---|---|
| `POST` | `/api/audio/tts` | TTS 语音合成任务规划 |
| `POST` | `/api/audio/bgm` | BGM 背景音乐任务规划 |
| `POST` | `/api/audio/sfx` | 音效任务规划 |
| `POST` | `/api/audio/batch` | 批量规划（**全成功或全回滚**） |
| `GET` | `/api/audio/jobs` | 任务列表 |
| `GET` | `/api/audio/jobs/{job_id}` | 任务详情 |
| `POST` | `/api/audio/jobs/{job_id}/render` | 渲染为真实 WAV |
| `GET` | `/api/audio/jobs/{job_id}/audio` | 下载 WAV 二进制 |
| `GET` | `/api/audio/budget` | 按 `job_ids` 汇总预算 |

```http
POST /api/audio/tts
Content-Type: application/json

{ "text": "618 大促，今天开抢", "voice_id": "zh_female_warm", "speed": 1.0 }
```

```json
// 200
{
  "job_id": "aud_3f9a1c2b",
  "kind": "tts",
  "status": "planned",
  "params": {
    "text": "618 大促，今天开抢",
    "chars": 11,
    "voice_id": "zh_female_warm",
    "voice_lang": "zh-CN",
    "speed": 1.0, "volume": 1.0, "pitch": 0.0, "sample_rate": 24000
  },
  "estimated_duration_s": 2.44,
  "estimated_cost_cny": 0.00132,
  "estimated_bytes": 78080,
  "finished_at": null,
  "error": null
}
```

**时长估算模型**：中文 4.5 字/秒，其他字符 14 字符/秒，再除以 `speed`。`speed` 钳制在 `[0.5, 2.0]`。

**渲染流程**（两阶段，规划与渲染解耦）：

```http
POST /api/audio/jobs/{job_id}/render        # 1. 渲染
GET  /api/audio/jobs/{job_id}/audio          # 2. 下载
```

```json
// render 200
{
  "job_id": "aud_3f9a1c2b",
  "status": "done",
  "output": { "format": "wav", "bytes": 58624, "audio_url": "/api/audio/jobs/aud_3f9a1c2b/audio" },
  "finished_at": 1756000005.2,
  "error": null
}
```

| 状态码 | 含义 |
|---|---|
| `404` | 任务不存在 |
| `409` | 任务尚未渲染完成 —— 需先调用 `render` |

**约定**：`render` 幂等，重复调用直接返回已完成任务。音频二进制通过 `audio_url` 返回而非内联 base64，避免 JSON 膨胀。

**合成模式说明**：当前 `render` 使用**本地正弦波合成**（`mode=demo`），用于验证管线连通性与时长正确性，不是真实人声。接入真实 TTS 时只需替换 `engine.render_job()` 内的 `synth_*` 调用，接口契约不变。

### 2.3 批量规划

```json
// POST /api/audio/batch
{
  "requests": [
    { "kind": "tts", "text": "旁白", "voice_id": "zh_female_warm" },
    { "kind": "bgm", "bgm_id": "bgm_warm_acoustic", "duration_s": 30 },
    { "kind": "sfx", "sfx_id": "sfx_ui_success" }
  ]
}
```

**约定**：**任一子任务非法则整体回滚** —— 已成功登记的任务会被移除，绝不残留半成功状态。保证预算与实际执行一致。

### 2.4 混音计划

| Method | Endpoint | 说明 |
|---|---|---|
| `POST` | `/api/audio/mix` | 生成混音计划（含闪避与母线检查） |
| `GET` | `/api/audio/tools/gain` | 线性音量 → dB 换算 |
| `GET` | `/api/audio/tools/atempo` | BPM 匹配比例计算 |

```json
// POST /api/audio/mix
{
  "voice": { "track_id": "v1", "kind": "voice", "duration_s": 10, "gain_db": 0 },
  "bgm":   { "track_id": "b1", "kind": "bgm", "duration_s": 30, "gain_db": -6,
             "duck_under_voice": true },
  "sfx": [
    { "track_id": "s1", "kind": "sfx", "start_s": 5.0, "duration_s": 0.7, "gain_db": -3 }
  ],
  "master_ceiling_db": -1.0
}
```

```json
// 200
{
  "total_duration_s": 30.0,
  "peak_gain_db": 0.0,
  "tracks": [
    { "track_id": "v1", "kind": "voice", "start_s": 0.0, "duration_s": 10.0, "gain_db": 0.0 },
    { "track_id": "b1", "kind": "bgm", "start_s": 0.0, "duration_s": 30.0, "gain_db": -6.0 },
    { "track_id": "s1", "kind": "sfx", "start_s": 5.0, "duration_s": 0.7, "gain_db": -3.0 }
  ],
  "warnings": []
}
```

**混音规则**：
- `duck_under_voice`：BGM 在人声活跃时段自动压低 `-12 dB`（闪避）
- `peak_gain_db` 超过 `master_ceiling_db` → `warnings` 追加"超过母线上限"
- 无人声但配置了闪避 → `warnings` 追加"未检测到人声"
- `total_duration_s` = 所有轨道的最晚结束时间（不含人声时取 BGM）

```http
GET /api/audio/tools/atempo?target_bpm=90&current_bpm=120
```

```json
{ "ratio": 0.75, "filter": "atempo=0.75", "clamped": false }
```

**约定**：`atempo` 滤镜只接受 `[0.5, 2.0]`，超出则钳制并置 `clamped: true`。

---

## 3. Game Assets API `/api/game-assets`

### 3.1 预设与规格

| Method | Endpoint | 说明 |
|---|---|---|
| `GET` | `/api/game-assets/presets` | 9 个预设（5 sprite + 4 tilemap） |
| `POST` | `/api/game-assets/sprite-sheet` | Sprite Sheet 打包规格 |
| `POST` | `/api/game-assets/texture` | 纹理规格与显存占用 |
| `POST` | `/api/game-assets/tilemap` | Tilemap 规格与数据量 |
| `POST` | `/api/game-assets/preset/{preset_id}` | 按预设展开完整规格 |

```http
POST /api/game-assets/sprite-sheet
Content-Type: application/json

{
  "frame_width": 32, "frame_height": 32,
  "count": 60, "columns": 8,
  "bleed_px": 2, "padding_px": 2
}
```

```json
// 200
{
  "frame_width": 32, "frame_height": 32,
  "columns": 8, "rows": 8,
  "count": 64,
  "bleed_px": 2, "padding_px": 2,
  "sheet_width": 320, "sheet_height": 320,
  "frames": [[2, 2, 32, 32], [42, 2, 32, 32], "..."]
}
```

**帧矩形算法**：帧在 sheet 中的位置按 **cell 步长**推进
（`cell = frame + 2×padding + 2×bleed`），起始内缩 `padding + bleed`。
不能用打包后尺寸反推帧数 —— 有 padding 时那样会算错。

```json
// POST /api/game-assets/texture
{ "width": 2048, "height": 2048, "mipmaps": true }
```

```json
// 200
{
  "width": 2048, "height": 2048, "tileable": true, "mipmaps": true,
  "anisotropy": 4, "format": "rgba8888", "srgb": true,
  "estimated_bytes": 25165824,
  "estimated_mb": 24.0
}
```

**约定**：mip 链约 +33% 显存（×4/3）；`anisotropy` 限 `1/2/4/8/16`；`format` 限 `rgba8888`/`rgb888`/`rg16f`；尺寸上限 `8192`（兼容主流移动端）。

```json
// POST /api/game-assets/tilemap
{ "columns": 200, "rows": 200, "layer_count": 4 }
```

```json
// 200
{
  "columns": 200, "rows": 200, "tile_width": 16, "tile_height": 16,
  "layer_count": 4, "estimated_bytes": 320000, "estimated_kb": 312.5
}
```

**约定**：索引按 `uint16` 计（瓦片集上限 65535 帧）。

| 状态码 | 含义 |
|---|---|
| `400` | 参数非法（尺寸为 0、出血过大、超 GPU 上限、非法格式等） |
| `404` | 未知 `preset_id` |

**设计边界**：本模块只做**规格计算与校验**（纯函数，无像素生成）。实际图像生成需接入图像模型，产出的参数可直接喂给打包器或生成管线。

---

## 4. 错误码速查

| 码 | 含义 | 常见场景 |
|---|---|---|
| `400` | 请求参数非法 | 角色非法、文本为空、出血过大、时间已过 |
| `401` | 未登录 / token 无效 | 缺 `Authorization` 头或 token 过期 |
| `403` | 已登录但权限不足 | viewer 尝试改角色、非成员访问 |
| `404` | 资源不存在 **或** 状态不允许 | 分享链接过期、审批已决、任务未渲染 |
| `409` | 状态冲突 | 排期重复执行 |

> `404` vs `400`：对"已决审批""已失效链接"返回 `404` 而非 `400` —— 这些资源已不在可操作集合中，
> `400` 会误导调用方认为是参数问题。