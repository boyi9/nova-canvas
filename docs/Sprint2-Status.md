# Sprint 2 完成度核查清单（计划 vs 实际）

> 用途：对齐「计划文档」与「代码实际状态」，标出已交付项与真实缺口，供前端收尾 / 后端接手 / PM 排期使用。
> 核查方式：静态代码走查 + `tsc --noEmit` 零错误 + `vitest` 全量通过（88/88）。未启动后端联调，故「后端耦合」项的状态以代码可达性判断。

## 一、结论速览

- 前端范畴的 Sprint 2 功能**已实质交付**：批量主图、短视频、爆款裂变、详情页编排、电商全流程、沙箱脚本、源文件交付（剪映/SVG/PPTX）、提示词库网络缓存、Nova 首页一键生成桩均已落地。
- 剩余高价值缺口**主要为后端项**：Agent 流式消息、多 OpenAI 接口路由/密钥、会员支付。风格迁移真实接口与 UI 已由前端完成（仅本地上传依赖后端媒体托管）。前端无法独立完成纯后端项，强行写桩价值有限。
- 仅 PSD 源文件导出未做（二进制格式成本高，建议后端或第三方库专项处理）。

## 二、逐项核查

| # | 计划项 | 状态 | 关键证据（代码位置） | 备注 |
|---|--------|------|----------------------|------|
| 1 | 多 OpenAI 兼容接口调度 | ⚠️ 前端齐 / 后端缺 | `components/ai-provider-chat.tsx`（`listProviders`+`chatWithProvider`）、`components/layout/model-select-modal.tsx` | 前端选择器齐全；后端模型路由与多密钥管理未知 |
| 2 | 自定义生图脚本调用能力（沙箱隔离） | ✅ 已完成 | `lib/canvas/plugin-iframe-loader.ts`（`runIframeScript`/`runIframeScriptFromUrl`）、`components/canvas/canvas-plugin-manager-modal.tsx` 脚本标签页；提交 `41569e0` | 隔离 iframe + `hostBridge` 回写 |
| 3 | 电商主图批量生成 | ✅ | `components/batch-hero-image.tsx`、`services/nova/api.ts#batchGenerateImages` | — |
| 4 | 详情页智能编排 | ✅ | `lib/canvas/detail-page-layout.ts`、`components/ecommerce-full-flow.tsx` | 自动布局 + 一键套用 |
| 5 | 短视频生成 | ✅ | `components/video-generator.tsx`、`services/nova/api.ts#generateVideoComposition` | — |
| 6 | 爆款复刻 / 裂变 | ✅ | `components/hit-fission.tsx`；画布写回补全于 `91f6c91` | 已补「生成到画布」闭环 |
| 7 | 电商场景全流程串联 | ✅ | `components/ecommerce-full-flow.tsx` | 编排→批量生图→工作流串联 |
| 8 | 源文件交付（PSD/剪映/SVG/PPTX） | ✅ 剪映+SVG+PPTX | 剪映：`lib/canvas/video-draft-compiler.ts`；SVG：`lib/canvas/canvas-svg-export.ts`（`ae54e78`）；PPTX：`lib/canvas/canvas-pptx-export.ts`（`e7117d5`，引入 pptxgenjs） | **PSD 未做** |
| 9 | 提示词库网络缓存 | ✅ | `services/api/prompts.ts`：localforage TTL 缓存、`refreshAllSources`/`refreshDueSources`、签名失效重拉；`stores/use-prompt-source-store.ts` | 含离线兜底 |
| 10 | Nova 首页「一键生成」 | ✅ 已补桩 | `pages/nova/index.tsx#handleGenerate` 原仅 `console.log`，已接 `batchGenerateImages`/`generateAdScript`/`chatCompletion`（`ae7054f`）；`components/nova/scene-workbench.tsx` 结果展示 | — |
| 11 | 跨平台 Agent 适配 | ⚠️ 部分 | `components/nova/nova-agent-panel.tsx`、`scene-workbench.tsx#handleAgentMessage` 仍为 `TODO: 处理Agent消息` | 前端面板在，后端流式未接 |
| — | 风格迁移真实接口（P1） | ✅ 完成 | `templates/style-transfer.ts#transferImageStyle/Video` 调用 `/generate/style-transfer` 并轮询 `/generate/status/{taskId}`（含单测 `style-transfer.test.ts` 3 用例）；`style-transfer-picker.tsx` 已支持粘贴公网 URL + 选择风格 + 实时展示结果；`scene-workbench.tsx` 已接入 | 后端端点已存在于 SDK 契约；暂仅支持公网可达 URL（本地上传依赖后端媒体托管） |
| 12 | 合规 + 性能 | ⚠️ 合规✅/性能未专项 | 合规：`lib/canvas/canvas-compliance.ts`、`components/canvas/canvas-top-bar.tsx#onCheckCompliance` | 性能无专项压测/优化 |
| 13 | 会员 / 支付 / onboarding | ⚠️ UI 有 / 支付需后端 | `i18n ...membership`、`components/canvas/canvas-top-bar.tsx#onOpenMembership` | 支付链路依赖后端 |

## 三、真实缺口（需后端，按优先级）

| 优先级 | 缺口 | 当前代码位置 | 后端依赖 |
|--------|------|--------------|----------|
| P0 | 多 OpenAI 接口调度（路由/多密钥） | 前端选择器已就绪 | 后端 `/ai/providers`、按模型路由、密钥管理 |
| P1 | 风格迁移 UI 接入 | ✅ 已完成：`StyleTransferPicker` 现支持粘贴公网 URL + 风格/强度 + 实时展示结果（`scene-workbench.tsx` 已接入） | 暂仅支持公网可达 URL；本地上传需后端媒体托管 |
| P1 | SceneWorkbench Agent 消息 | `scene-workbench.tsx:61` TODO | Agent 后端 + 流式协议 |
| P2 | 会员 / 支付 | `membership` UI | 支付网关、订单、权益下发 |
| P2 | PSD 源文件导出 | 仅 SVG/PPTX/剪映 | 二进制 PSD 编码（ag-psd 或后端渲染） |
| P3 | 性能专项 | 画布节点规模压测 | — |

## 四、建议的下一步

1. **后端补齐 P0/P1**：多模型路由 → 风格迁移 API → Agent 流式。前端桩已留好接入点，后端就绪即可联调。
2. **前端收尾（可选）**：对已交付功能做端到端验证与体验/边界打磨（尤其裂变后端 `/ai/fission`、短视频合成是否真出片）。
3. **文档**：本清单 + 已有的 `docs/sandbox-plugin-guide.md` 构成前端交付基线。

## 五、验证记录

- `npx tsc --noEmit`：零错误。
- `npx vitest run`：**88/88** 通过（含 `fission-nodes`、`canvas-svg-export`、`canvas-pptx-export`、`plugin-iframe-script` 等新增单测）。
- 提交脉络：`41569e0` 脚本 → `91f6c91` 裂变写回 → `ae54e78` SVG → `e7117d5` PPTX → `ae7054f` 首页生成。
