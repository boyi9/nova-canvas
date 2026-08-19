# Sprint 1 Week 2 任务执行指南（插件系统 + 基础设施 Part 2）

> 基于 `board-import/v1.0-20250101-tasks.csv` 生成，供本地/云端开发直接参考
> 注：Week 2 前半部分（AGENT-001 MCP）见 `docs/sprint1-w2-task-guide.md`

---

## 任务清单

| 任务ID | 任务名称 | 详细执行指令 | 验收标准 | 交付物 |
| --- | --- | --- | --- | --- |
| S1-W2-D4-01 | PLUGIN-001 远程插件安装核心框架 | 实现插件URL解析、manifest校验、代码下载、沙箱加载全流程，支持远程节点插件从URL动态安装 | 输入合法的插件URL后可10秒内完成安装并加载，插件功能正常可用 | 前端插件框架核心逻辑 |
| S1-W2-D4-02 | PLUGIN-001 插件启用/禁用/更新/卸载状态机 | 实现插件全生命周期状态流转，UI实时同步插件状态 | 插件安装→启用→更新→禁用→卸载流程无异常，状态不同步 | 插件生命周期管理逻辑 |
| S1-W2-D5-01 | PLUGIN-001 插件热加载无刷新机制 | 实现插件代码热更新，无需刷新整个浏览器页面即可生效 | 更新插件版本后功能立即生效，页面状态完全保留 | 插件热加载能力 |
| S1-W2-D5-02 | INFRA-003 Docker开发环境一键启动 | 完善docker-compose.yml配置，包含前端、后端、PostgreSQL、Redis所有服务，3000端口启动服务直接可用 | 执行docker compose up -d后所有服务自动启动，等待60秒即可访问localhost:3000 | 完整docker-compose.yml镜像配置 |
| S1-W2-D5-03 | INFRA-003 Render部署指引文档更新 | 编写Render一键部署完整指引文档，包含环境变量配置、构建命令、健康检查规则 | 零基础用户按照文档步骤操作，30分钟内即可完成Render上的完整部署 | 输出`RENDER_DEPLOY.md`部署指引文档 |

---

## 依赖关系图

```
PLUGIN-001 核心框架 (D4-01)
    ↓
插件生命周期状态机 (D4-02) → 插件热加载 (D5-01)
    ↓
INFRA-003 Docker/Render (D5-02, D5-03)  ← 依赖 PLUGIN-001 完成
```

---

## 快速启动命令（VS Code Continue）

| Task | 命令/操作 |
|------|-----------|
| 插件安装框架 | 手动编写 `src/plugin/framework/installer.ts` |
| 插件状态机 | 手动编写 `src/plugin/lifecycle/state-machine.ts` |
| 插件热加载 | 手动编写 `src/plugin/hot-reload/hmr.ts` |
| Docker Compose | 编辑 `docker-compose.yml` 根目录 |
| Render 部署文档 | 生成 `docs/RENDER_DEPLOY.md` |
| 单测补全 | `/gen-test` |
| PR 审查 | `/review-pr` |
| 看板同步 | `/sync-board` |

---

## 验收检查清单（每 Task 通用）

- [ ] 代码实现完整，无 TODO/FIXME
- [ ] 单测覆盖率 ≥ 80%（`pnpm test`）
- [ ] Lint 通过（`eslint`）
- [ ] 无新增非 MIT 依赖（`review-pr` 自动扫描）
- [ ] TypeScript 编译零错误（`tsc --noEmit`）
- [ ] 看板任务标记 DONE（`/sync-board`）
- [ ] ADR 记录关键决策（`/adr`）

---

## PLUGIN-001 核心接口设计（建议）

```typescript
// src/plugin/framework/types.ts
interface PluginManifest {
  name: string;
  version: string;
  entry: string;           // 远程 JS 入口 URL
  sandbox: 'iframe' | 'webworker';
  permissions: string[];   // 申请的权限
  canvasNodes: string[];   // 提供的节点类型
}

interface PluginInstance {
  manifest: PluginManifest;
  status: 'installing' | 'installed' | 'enabled' | 'disabled' | 'updating' | 'uninstalling' | 'error';
  sandbox: Window | Worker; // 隔离上下文
  exports: Record<string, any>; // 暴露的 API
}

// src/plugin/framework/installer.ts
async function installPlugin(url: string): Promise<PluginInstance> {
  // 1. 下载 manifest.json
  // 2. 校验 schema + 签名
  // 3. 下载 entry 代码
  // 4. 创建 iframe/WebWorker 沙箱
  // 5. 注入 CSP + postMessage 通道
  // 6. 返回 PluginInstance
}

// src/plugin/lifecycle/state-machine.ts
type PluginEvent = 'install' | 'enable' | 'disable' | 'update' | 'uninstall';
function transition(state: PluginStatus, event: PluginEvent): PluginStatus {
  // 状态流转表：installing→installed→enabled↔disabled→updating→enabled→uninstalling→uninstalled
}
```

---

## INFRA-003 Docker Compose 关键服务

| 服务 | 镜像 | 端口 | 环境变量关键项 |
|------|------|------|----------------|
| frontend | `node:20-alpine` (build) | 3000 | `VITE_API_BASE=http://backend:8080` |
| backend | `golang:1.22-alpine` (build) | 8080 | `GOPROXY=https://goproxy.cn,direct`<br>`DB_HOST=postgres`<br>`REDIS_HOST=redis` |
| postgres | `postgres:16-alpine` | 5432 | `POSTGRES_DB=novacanvas`<br>`POSTGRES_PASSWORD=${DB_PASSWORD}` |
| redis | `redis:7-alpine` | 6379 | — |

---

## RENDER_DEPLOY.md 大纲（必含章节）

1. **前置准备**：GitHub 仓库、Render 账号、域名（可选）
2. **环境变量表**：所有必填/选填变量、来源说明
3. **Blueprint 部署**：`render.yaml` 完整配置
4. **手动部署步骤**：Web Service + PostgreSQL + Redis 创建顺序
5. **健康检查配置**：`/health` 路径、超时、重试
6. **常见问题**：构建失败、数据库迁移、环境变量不生效
7. **回滚/更新流程**：`render deploy`、镜像标签管理

---

## 参考文件

- **任务 CSV**：`board-import/v1.0-20250101-tasks.csv` (第 18-22 行)
- **Week 1 指南**：`docs/sprint1-w1-task-guide.md`
- **Week 2 Part 1 (MCP)**：`docs/sprint1-w2-task-guide.md`
- **编码规范**：`.continue/knowledge/coding-rules.md`