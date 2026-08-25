# Nova 启画 — 3 天零等待启动清单

> 完全基于现有资产：**README.md（战略）** + **Sprint1-W1-Deliverables.md（执行）** + **本地模型已就绪**

---

## 第 1 天：环境就绪 + 知识库落盘（预计 30 分钟）

### 1.1 拉取本地模型（并行跑，约 5-10 分钟）
```powershell
# PowerShell 管理员模式
ollama pull deepseek-r1:14b
ollama pull qwen2.5-coder:14b
ollama pull nemotron-mini:4b
ollama pull qwen2.5:14b
ollama pull nomic-embed-text
```

### 1.2 放置 Continue 配置（已生成，直接覆盖）
```powershell
# 已生成到 D:\nova启画\novacanvas\.continue\config.json
# 无需手动编辑，直接使用
```

### 1.3 初始化知识库（把战略文档“压缩”进规范文件）
```powershell
# 1) 确保目录存在
mkdir -Force D:\nova启画\novacanvas\.continue\knowledge

# 2) coding-rules.md 已生成（含 MIT红线、Go环境锁定、.env去BOM、路径兼容、避坑清单）
# 3) 抽取架构/契约到单独文件（供云端/本地随时 @file 引用）
# 从 README.md 抽取 → architecture.md
# 从 Sprint1-W1-Deliverables.md 的 2.4 节抽取 → api-contracts.md
# 从 README.md 的 2.1/2.2/5 抽取 → adr-template.md
```

**产出验证**：
- `D:\nova启画\novacanvas\.continue\knowledge\coding-rules.md` 存在
- `D:\nova启画\novacanvas\.continue\knowledge\architecture.md` 存在
- `D:\nova启画\novacanvas\.continue\knowledge\api-contracts.md` 存在
- `D:\nova启画\novacanvas\.continue\config.json` 存在

---

## 第 2 天：跑通第一个 Task 闭环（INFRA-001，预计 2 小时）

### 2.1 本地：生成 INFRA-001 完整实现
```powershell
# 在 VS Code / Cursor 打开项目根目录，Continue 侧边栏输入：
@Sprint1-W1-Deliverables.md # 让模型读取上下文
/gen-infra001
```
**预期产出**：
- `src/infra/ci-pipeline/INFRA-001/index.ts` 补全：fast-glob + actions/cache + 真实 git 操作
- 运行 `pnpm tsx src/infra/ci-pipeline/INFRA-001/index.ts` → 生成 `.github/workflows/sync-upstream.yml`
- 文件语法正确、含 `schedule`/`workflow_dispatch`/`permissions`/`conflict PR`/`regression test`

### 2.2 本地：自测 + 单测
```powershell
pnpm test src/infra/ci-pipeline/INFRA-001/index.test.ts
# 覆盖率 ≥ 80% 即可
```

### 2.3 云端：Review + 合并 + 看板同步
```bash
# opencode 会话中：
/review @src/infra/ci-pipeline/INFRA-001/index.ts
/coverage-check
/sync-board
/adr "INFRA-001 完成：GitHub Actions 每日同步上游，含冲突 PR 自动创建、回归测试集成"
```

**验收**：
- `.github/workflows/sync-upstream.yml` 存在且可被 GitHub Actions 识别
- `board-import/tasks.csv` 中 `S1-W1-D1-01` 标记 `DONE`
- Jira/GitHub Projects/飞书三端自动同步绿灯

---

## 第 3 天：建立标准日常节奏（全自动化，预计 15 分钟建立，之后每天 0 维护）

### 3.1 云端：生成本周 ADR 计划
```bash
/plan "基于 Sprint1-W1-Deliverables.md，制定本周每日交付清单，输出到 docs/adr/001-sprint1-w1-plan.md"
```
**产出**：`docs/adr/001-sprint1-w1-plan.md`（含每日 Task 映射、依赖顺序、风险预警）

### 3.2 固化每日双检查点（加入日历/提醒）

| 时间 | 动作 | 指令 | 产出 |
|------|------|------|------|
| **09:00** | 云端定计划 | `/plan "今日 Task：S1-W1-D2-01 INFRA-002 真实 clone + fast-glob + ts-morph"` | 当日 ADR 计划 |
| **09:15** | 本地开工 | Continue 侧边栏 `/gen-infra002` | 代码实现 |
| **12:00** | 本地自测 | `pnpm test` / `go test ./...` | 绿灯 |
| **15:00** | 云端 Review | `/review @src/infra/regression/INFRA-002/index.ts` | Review 报告 |
| **15:30** | 本地修复 | `/gen-test` + 修代码 | 覆盖率 ≥80% |
| **17:30** | 云端收尾 | `/coverage-check` → `/sync-board` → `/adr` | PR 合并、看板绿、决策归档 |

### 3.3 后续每天重复 3.2，Task 顺序按 ADR 计划：

| Day | Task | 自定义命令 | 关键产出 |
|-----|------|-----------|----------|
| D2 | INFRA-002 真实提取 | `/gen-infra002` | `tests/regression/upstream/` + `test-manifest.json` |
| D3 | INFRA-002 自动化脚本 | `/gen-test` + 手工补 | `run-baseline.sh` 可跑通 |
| D4 | CANVAS-001 兼容性分析 | `/gen-canvas001` | `COMPATIBILITY_ANALYSIS.md` |
| D5 | CANVAS-001 渲染引擎改造 | `/gen-go-api` (若涉及后端) | 代码 + 单测 |
| W2 | MCP Demo 闭环补全 | `/gen-go-api` + 手工 | CanvasBridge 对接真实画布核心 |

---

## 零维护保证清单（配置一次，永久生效）

| 项 | 已内置位置 | 说明 |
|----|-----------|------|
| Go 环境变量锁定 | `coding-rules.md` §3 + 本地命令前自动注入 | 杜绝构建失败 |
| .env 自动去 BOM | `coding-rules.md` §4 + 生成脚本内置 | 杜绝 JWT_SECRET 失效 |
| PowerShell JSON 转义 | `fix-powershell-json` 命令 | 杜绝 400 报错 |
| 路径 Windows 兼容 | `coding-rules.md` §4 | 杜绝路径识别错误 |
| 依赖许可证合规 | `review-pr` 自动扫描 | 杜绝 AGPL 污染 |
| 三端看板零差异 | `/sync-board` 读 tasks.csv → 写 Jira/GH/飞书 | 杜绝手动二次更新 |
| 接口契约单一源 | 云端 ADR → `api-contracts.md` → 双端自动生成 | 杜绝前后端对不齐 |

---

## 遇到异常的最短排查路径

| 现象 | 1 分钟定位 | 2 分钟修复 |
|------|-----------|-----------|
| Go build 失败 | `debug-go-log` 读日志 | 按根因生成补丁 |
| 测试不达标 | `/coverage-check` 看缺口 | `/gen-test` 补单测 |
| 看板不同步 | `board-import/tasks.csv` 核对 | `/sync-board` 强制刷新 |
| 前后端字段对不齐 | `/adr` 查契约 | 云端改 ADR → 双端重新生成 |
| 新依赖报 license 错误 | `review-pr` 报告里直接给替代库 | 换依赖 + `go mod tidy` / `pnpm install` |

---

## 完成标志（第 3 天结束时应达成）

- [ ] 3 个本地模型跑通、`config.json` 生效
- [ ] `coding-rules.md` / `architecture.md` / `api-contracts.md` 落盘
- [ ] INFRA-001 完整跑通、看板绿灯、ADR 归档
- [ ] 本周 ADR 计划生成、每日双检查点进日历
- [ ] 后续每天 **0 配置、0 等待、纯执行**

---

> **核心心法**：云端只做“决策+审计”，本地只做“生产+验证”，中间靠 **ADR + 契约 + 看板** 无缝衔接。配置一次，永久受益。