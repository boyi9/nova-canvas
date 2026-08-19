# Nova 启画 — 编码规范与合规红线（单一事实源）

> **版本**：v1.1 | **更新**：2026-08-17 | **来源**：README.md 战略层 + Sprint1-W1-Deliverables.md 执行层 + 实战避坑

---

## 1. 硬性合规红线（违者直接阻断合并）

| 规则 | 校验方式 | 违规后果 |
|------|---------|----------|
| **MIT 许可证强制**：所有新增依赖（`package.json` / `go.mod`）必须为 MIT/BSD/Apache-2.0 等宽松协议，**严禁 AGPL/GPL/LGPL** | `review-pr` 自动扫描 `package.json` / `go.mod` diff，调用 `license-checker` / `go-licenses` 校验 | PR 自动标记 `license-violation`，CI 失败 |
| **零新增开源依赖**（除非经云端 ADR 批准） | `review-pr` 对比 `package.json` / `go.mod` 与基线 | 新依赖未走 ADR → 拒绝合并 |
| **不修改 `demo/` 目录下已验证的 MCP 逻辑** | `review-pr` 检查 `demo/` 变更 | 任何修改 → 直接拒绝 |

---

## 2. 语言/框架规范

### Go 后端
- **框架**：Gin + GORM + Asynq
- **路由**：RESTful，版本前缀 `/api/v1`
- **错误码**：统一 `code/message/data` 结构，业务错误 ≥ 10000
- **Swagger**：所有导出接口必须有 `@Summary` `@Description` `@Tags` `@Accept` `@Produce` `@Param` `@Success` `@Failure` `@Router`
- **单测**：`stretchr/testify` + `sqlmock`，覆盖率 ≥ 80%
- **依赖管理**：`go mod tidy` 后必须 `go mod verify`

### TypeScript 前端
- **框架**：React 18 + Vite + TanStack Query + Zustand
- **代码风格**：ESLint (Airbnb) + Prettier，严格模式
- **类型**：严禁 `any`，接口优先 `interface`，导出类型用 `type`
- **组件**：函数组件 + Hooks，无类组件
- **状态**：服务端状态 TanStack Query，客户端状态 Zustand

---

## 3. 环境与工具链锁定（Windows 本地强制生效）

| 项 | 强制值 | 生效方式 |
|----|--------|----------|
| **Go 代理** | `GOPROXY=https://goproxy.cn,direct` | 所有 Go 操作前自动 `export` / `setx` |
| **Go 校验和库** | `GOSUMDB=off` | 同上 |
| **Go 工具链** | `GOTOOLCHAIN=local` | 同上 |
| **Node 包管理** | `pnpm@9.x` | `.npmrc` 锁定 `package-manager=pnpm@9` |
| **Python** | 3.11+ | 仅用于脚本辅助 |

> **实现**：本地 `gen-go-api` / `debug-go-log` 等命令执行前，自动注入上述环境变量。

---

## 4. 文件与路径规范

| 规则 | 说明 |
|------|------|
| **路径分隔符** | 代码/配置/脚本中统一用 **正斜杠 `/`**；仅 Windows 原生命令（PowerShell/cmd）允许反斜杠 `\\` |
| **.env 文件** | **必须无 UTF-8 BOM**，纯 ASCII/UTF-8 文本；生成脚本内置 `iconv -f utf-8 -t utf-8` 或 `sed '1s/^\xEF\xBB\xBF//'` 去 BOM |
| **行尾** | LF (`\n`)，Git 配置 `core.autocrlf=input` |
| **编码** | UTF-8 无 BOM |

---

## 5. 安全与数据规范

- **密钥/Token**：严禁写入代码/提交历史，统一走环境变量或密钥管理
- **SQL 注入**：GORM 占位符 `?` / 命名参数，严禁字符串拼接
- **XSS**：前端输出统一 `dangerouslySetInnerHTML` 仅配合 DOMPurify
- **CSRF**：Gin `csrf` 中间件全局开启，API 走 JWT 鉴权
- **日志脱敏**：`password` `token` `secret` `key` 字段自动掩码 `****`

---

## 6. 测试与质量门禁

| 门槛 | 工具 | 失败处理 |
|------|------|----------|
| **Go 单测覆盖率 ≥ 80%** | `go test -coverprofile=coverage.out` | CI 失败 |
| **TS 单测覆盖率 ≥ 80%** | `vitest --coverage` | CI 失败 |
| **Lint 0 错误** | `golangci-lint` / `eslint` | CI 失败 |
| **无循环依赖** | `madge --circular` (TS) / `go mod graph` (Go) | CI 失败 |
| **依赖许可证合规** | `license-checker` / `go-licenses` | CI 失败 |

---

## 7. Git 与提交规范

- **分支**：`feature/{task-id}-{short-desc}` → `develop` → `main`
- **提交信息**：`feat/fix/docs/refactor/chore(scope): subject`（Conventional Commits）
- **PR 模板**：关联 Task ID、验收清单勾选、覆盖率截图、ADR 链接
- **Code Review**：至少 1 人 approve，`review-pr` 自动输出报告

---

## 8. 文档同步规则（单一事实源）

| 文档 | 维护方 | 触发更新 |
|------|--------|----------|
| `architecture.md` | 云端 | 架构变更、新增模块、接口契约变更 |
| `api-contracts.md` | 云端 | 新增/变更 REST/gRPC/MCP 接口 |
| `coding-rules.md` | 云端 | 规范变更、新增避坑 |
| `board-import/*.csv/.json` | 云端自动同步 | ADR 生成/任务状态变更 → 自动重写导入文件 |
| `CHANGELOG.md` | 云端 | Release 时自动生成 |

> **自动化**：云端 `/sync-board` 指令读取 `board-import/tasks.csv` → 更新 Jira/GitHub Projects/飞书三套导入文件，保证三端零差异。

---

## 9. 实战避坑清单（已验证，直接生效）

| 坑点 | 症状 | 根因 | 规避措施（已内置） |
|------|------|------|-------------------|
| **Go 构建失败** | `go build` 报 `cannot download module` | 无代理/校验和库阻断 | 强制 `GOPROXY/GOSUMDB/GOTOOLCHAIN` |
| **JWT_SECRET 未加载** | 启动 `FATAL: JWT_SECRET not set` | `.env` 含 UTF-8 BOM | 生成 `.env` 自动去 BOM，读取前校验 |
| **PowerShell JSON 报错** | `Invoke-WebRequest -d '{}'` 400 | 单引号/双引号转义 | `fix-powershell-json` 输出文件法/Here-String |
| **路径识别错误** | `open D:\path\file` 找不到 | 反斜杠转义/字符串解析 | 代码统一 `/`，仅原生命令用 `\\` |
| **godotenv 惰性加载** | 函数内 `Load()` 不生效 | 调用时机晚于变量读取 | `godotenv.Load()` 放 `init()`/`main()` 最开头 |
| **依赖许可证污染** | 引入 AGPL 库导致整项目传染 | 未校验 | `review-pr` 自动扫描 `go.mod`/`package.json` |
| **跨语言接口对不齐** | TS 字段 `camelCase`，Go `snake_case` | 无契约 | 云端 ADR 定契约，双端自动生成代码 |

---

## 10. 角色分工矩阵（最终版）

| 场景 | 推荐模型 | 理由 |
|------|---------|------|
| **架构决策、技术选型、跨文件重构、复杂逻辑推理** | 云端 | 上下文大、推理强、全局视角 |
| **Go后端接口、Gin路由、GORM数据层、Asynq任务队列** | 本地 | 熟悉 Go 生态标准写法，token 少 |
| **PostgreSQL索引优化、Redis缓存策略、数据库迁移脚本** | 本地 | 基于全量 DB 上下文生成最优方案，无泄露 |
| **TS前端组件、Hooks、单测、脚本、正则** | 本地 | 高频低难度，延迟低、私密 |
| **跨语言联调(TS↔Go)接口契约** | 云端 | 全局视角对齐两端字段定义 |
| **PR Review、安全扫描、依赖分析、提交信息** | 本地 | 可跑完整 repo 上下文，无数据出域 |
| **调试复现、日志分析、性能剖析** | 混合 | 云端定方案 → 本地跑验证 |
| **CI/部署脚本、Git hooks** | 本地 | 熟悉 shell/TS/Go，token 省 |

---

## 11. 标准工作流（每 Task ≤ 2 天闭环）

```
09:00 云端 /plan           → 拆解当日 Task，输出 ADR（若需）
09:15 本地 gen-*           → 按骨架填实现、补单测、生成脚本
12:00 本地 自测跑通        → pnpm test / go test ./...
15:00 云端 /review         → 读取 diff，输出 Review 报告
15:30 本地 修复 Review     → gen-test / 修代码
17:30 云端 /coverage-check → 判定 ≥80% → 合并 PR
17:45 云端 /sync-board     → 任务标记 DONE，三端看板自动同步
18:00 云端 /adr            → 记录关键决策，同步 api-contracts/architecture
```

---

**维护**：云端负责写规范、改规范；本地负责读规范、按规范干活。规范变更 → 云端改此文件 → 本地下次会话自动生效。