# ADR 002 — Sprint 2 执行计划（AI / Agent / Plugin / Prompt）

- **状态**：已批准（Proposed → Accepted）
- **日期**：2026-08-18
- **作者**：云端 `/plan`
- **关联文档**：`docs/sprint2-full-task-guide.md`、`board-import/v1.0-20250101-tasks.csv`
- **决策范围**：Sprint 2 全部 7 个 Story 的执行顺序、关键路径、风险熔断、验收门禁

---

## 1. 背景

Sprint 1 已完成基础设施（INFRA-001/002）、画布兼容（CANVAS-001）与本地模型验证流水线。
Sprint 2 进入**业务功能密集交付期**，涉及 7 个 Story、共 25 个 Task，跨度 S1-W3 ~ S1-W5。
核心目标：打通「多模型调度 → 脚本沙箱 → 画布对话生图 → 跨平台 Agent → 插件 SDK/权限 → 提示词缓存」全链路。

---

## 2. 周度执行计划

### Week A — S1-W3：AI 能力基座（AI-001 + AI-002）
| 日 | Task | 交付 | 命令 |
|----|------|------|------|
| D1 | S1-W3-D1-01 适配器设计 | `adapter.py` + `docs/adapter-design.md` | `/gen-ai001` |
| D2 | S1-W3-D1-02 文生图/图生图 | `t2i.py` `i2i.py` | `/gen-ai001` |
| D3 | S1-W3-D2-01 参考图/问答/音视频 | `edit.py` `chat.py` `audio.py` `video.py` | `/gen-ai001` |
| D4 | S1-W3-D2-02 熔断降级+监控 | `circuit_breaker.py` `prometheus_rules.yaml` | `/gen-ai001` |
| D5 | S1-W3-D3-01 脚本配置 UI | `script-editor.vue` | `/gen-ai002` |
→ 周末：`/review-pr` + `/coverage-check` + `/sync-board` + `/adr`

### Week B — S1-W4：Agent + Plugin + Prompt 启动
| 日 | Task | 交付 | 命令 |
|----|------|------|------|
| D1 | S1-W3-D3-02 脚本沙箱 | `vm2-wrapper.ts` | `/gen-ai002` |
| D2 | S1-W3-D4-01/02 调度+市场 | `scheduler.service.ts` `script-market.vue` | `/gen-ai002` |
| D3 | S1-W3-D5-01/02 画布上下文+Prompt | `context.service.ts` `prompt.service.ts` | `/gen-agent002` |
| D4 | S1-W4-D1-01/02 + D2-01/02 跨平台 | `win/mac/linux-adapter.ts` | `/gen-agent003` |
| D5 | S1-W4-D3-01/02 + D4-01/02 SDK | `sdk/types` `sdk/examples` `sdk/docs` | `/gen-plugin002` |
→ 周末：同上四步

### Week C — S1-W4~W5：沙箱权限 + 提示词缓存 + 集成测试
| 日 | Task | 交付 | 命令 |
|----|------|------|------|
| D1 | S1-W4-D5-01/02 iframe沙箱+权限 | `iframe-sandbox.ts` `storage-interceptor.ts` | `/gen-plugin003` |
| D2 | S1-W4-D5-03 Prompt 同步器 | `prompt-sync.service.ts` | `/gen-prompt001` |
| D3 | S1-W5-D1-01 IndexedDB 缓存 | `prompt-cache.service.ts` | `/gen-prompt001` |
| D4 | S1-W5-D1-02 检索优化≤200ms | `prompt-api.ts` | `/gen-prompt001` |
| D5 | S1-W5-D2-01/02 集成测试流水线 | `tests/integration` `.github/workflows/integration-test.yml` | `/gen-test` |
→ 周末：全量 `/review-pr` + `/coverage-check` + `/sync-board` + `/adr`

---

## 3. 关键路径（Critical Path）

```
AI-001(适配器) ──► AI-002(脚本沙箱) ──► AGENT-002(对话生图) ──► AGENT-003(跨平台)
                                                            │
PLUGIN-003(沙箱权限) ──► PROMPT-001(缓存) ──┐               │
                                            └─► AI-001(调度闭环)
PLUGIN-002(SDK) 并行于 AGENT-003，无强依赖
```

**最强阻塞链**：AI-001 → AI-002 → AGENT-002 → AGENT-003（任意一环延迟，整体顺延 1 周）

---

## 4. 风险熔断（对应 sprint2-full-task-guide.md §5）

| 风险 | 熔断阈值 | 自动动作 |
|------|----------|----------|
| 视频生成成本 | 单次>5s 或 月预算>500 USD | 熔断 + 切备用模型 + Prometheus 告警 |
| 插件越权 | 安装申请超最小权限集 | 安装拦截 + 弹窗复核 |
| 跨平台路径 | `\` 未规范化导致 50 次验证失败 | 标准化函数 + 跨平台测试强制门禁 |

---

## 5. 验收门禁（每 Task 关闭前必须全绿）

1. `tsc --noEmit` 零错误
2. `pnpm test --coverage` ≥ 80%
3. 双 Agent 跨平台 50 次全通过
4. 脚本沙箱隔离测试通过
5. 提示词检索 ≤200ms
6. `/sync-board` 三端一致
7. 本周 ADR 已归档 `docs/adr/`

---

## 6. 决策记录

- **D1**：Sprint 2 采用「AI 基座先行，Agent/Plugin/Prompt 并行跟进」策略，避免沙箱/权限成为后期阻塞。
- **D2**：视频生成成本熔断在 `circuit_breaker.py` 统一实现，不分散到各能力模块。
- **D3**：提示词检索性能（≤200ms）作为 PROMPT-001 的硬指标，索引结构在 `prompt-cache.service.ts` 设计阶段定稿。
- **D4**：跨平台路径兼容由 `normalizePath()` 单一函数收口，禁止业务代码直接使用 `path.join`。

---

## 7. 后续动作

- 本地按 Week A~C 顺序执行 `/gen-*` 命令填充实现
- 每日 09:00 云端 `/plan` 微调当日清单
- 每日 17:30 云端 `/coverage-check` + `/sync-board` + `/adr`
- 全部 Task DONE 后触发 INFRA-004 三平台 50 次验证（S1-W5-D3-01）
