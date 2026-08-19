# Sprint 1 Week 2 任务执行指南（MCP 对接层）

> 基于 `board-import/v1.0-20250101-tasks.csv` 与 `demo/agent-mcp-canvas-loop/` 生成，供本地/云端开发直接参考

---

## 任务清单

| 任务ID | 任务名称 | 详细执行指令 | 验收标准 | 交付路径 |
| --- | --- | --- | --- | --- |
| S1-W2-D1-01 | AGENT-001 MCP协议基础类型定义 | 复用已提供的MCP Demo共享类型文件，定义完整的MCP 2024-11-05协议核心类型、Canvas数据结构、Agent交互类型、11个画布操作Tool的输入输出Schema | TypeScript类型编译零错误，所有Tool定义完全符合MCP官方协议规范 | `demo/agent-mcp-canvas-loop/shared/types.ts` |
| S1-W2-D1-02 | AGENT-001 MCP Server基础实现 | 实现MCP Server基础框架，支持stdio和WebSocket两种传输模式，完成能力协商、请求路由、资源注册、Prompt注册全流程能力 | 进程启动后可被Codex/Claude Code自动识别并接入，返回正确的服务端信息 | `demo/agent-mcp-canvas-loop/mcp-server/index.ts` |
| S1-W2-D2-01 | AGENT-001 Canvas操作Tool集实现 | 基于Canvas Bridge层实现全部11个Tool的逻辑：节点增删改查、连线管理、选中节点上下文获取、图片/视频生成、导出项目、视口操作 | 调用任意Tool返回结果格式完全符合Schema定义，画布状态实时同步更新 | `demo/agent-mcp-canvas-loop/canvas-bridge/index.ts` |
| S1-W2-D2-02 | AGENT-001 Codex App插件注册逻辑复用 | 完全复用官方Codex App插件的MCP自动注册逻辑，编写配置文件，实现Codex App安装插件后自动识别并拉起本MCP服务 | Codex App启动后自动发现nova-canvas MCP服务，自动完成注册无需手动配置 | 生成`agent-config.yaml`配置文件，可直接导入Codex使用 |
| S1-W2-D3-01 | AGENT-001 Claude Code适配层实现 | 编写Claude Code对应的MCP配置文件，实现与Claude Code的无缝对接，支持双Agent并存切换 | Claude Code启动后可直接调用所有11个画布Tool，操作画布无异常 | 生成Claude Code兼容配置，双Agent可切换使用 |
| S1-W2-D3-02 | AGENT-001 MCP对接层单测与集成测试 | 基于已提供的跨平台测试脚本，编写单元测试和集成测试用例，覆盖所有Tool调用场景 | 代码单测覆盖率≥80%，全流程闭环测试通过 | 所有测试用例运行100%通过 |

---

## 依赖关系图

```
S1-W2-D1-01 → S1-W2-D1-02 → S1-W2-D2-01 → S1-W2-D2-02
                                      ↓
                               S1-W2-D3-01 → S1-W2-D3-02
```

---

## 核心复用资产（已验证，严禁修改）

| 文件 | 作用 | 备注 |
|------|------|------|
| `demo/agent-mcp-canvas-loop/shared/types.ts` | 共享类型定义 | 已导出 CanvasNode, CanvasProject, ViewportState, AgentContext, AgentPrompt, AgentResponse, ToolCall, ToolResult, GenerationResult, MCPTool, CANVAS_TOOLS |
| `demo/agent-mcp-canvas-loop/canvas-bridge/index.ts` | Canvas ↔ Agent 桥接 | 已实现 CanvasBridge 核心逻辑 |
| `demo/agent-mcp-canvas-loop/mcp-server/index.ts` | MCP Server 入口 | 已实现 stdio/WebSocket 双模式 |
| `demo/agent-mcp-canvas-loop/scripts/cross-platform-test.ts` | 跨平台测试脚本 | 已验证 Windows/macOS/Linux |

---

## 快速启动命令（VS Code Continue）

| Task | 命令 |
|------|------|
| MCP 类型定义完善 | `/gen-test` (基于现有 types.ts) |
| MCP Server 实现 | 手动编辑 `demo/agent-mcp-canvas-loop/mcp-server/index.ts` |
| Canvas Bridge Tool 实现 | 手动编辑 `demo/agent-mcp-canvas-loop/canvas-bridge/index.ts` |
| Codex 配置生成 | 手动生成 `agent-config.yaml` |
| Claude Code 配置生成 | 手动生成 `.claude/mcp.json` |
| 单测/集成测试 | `pnpm test demo/agent-mcp-canvas-loop/` |

> 注：Week 2 任务多为基于已验证 Demo 的扩展与配置，暂无专用自定义命令，建议直接基于 Demo 代码修改。

---

## 验收检查清单（每 Task 通用）

- [ ] TypeScript 编译零错误（`tsc --noEmit`）
- [ ] 单测覆盖率 ≥ 80%（`vitest --coverage`）
- [ ] 所有 11 个 Tool 调用返回符合 Schema
- [ ] Codex App / Claude Code 双端可同时接入
- [ ] 跨平台测试脚本全绿（`pnpm cross-platform-test`）
- [ ] 看板任务标记 DONE（`/sync-board`）
- [ ] ADR 记录关键决策（`/adr`）

---

## 11 个 Canvas Tool 清单（需全部实现）

| # | Tool Name | 功能 | 输入 Schema | 输出 Schema |
|---|-----------|------|-------------|-------------|
| 1 | `create_node` | 创建节点 | `CreateNodeParams` | `ToolResult<CanvasNode>` |
| 2 | `delete_node` | 删除节点 | `DeleteNodeParams` | `ToolResult<void>` |
| 3 | `update_node` | 更新节点 | `UpdateNodeParams` | `ToolResult<CanvasNode>` |
| 4 | `query_nodes` | 查询节点 | `QueryNodesParams` | `ToolResult<CanvasNode[]>` |
| 5 | `create_connection` | 创建连线 | `CreateConnectionParams` | `ToolResult<Connection>` |
| 6 | `delete_connection` | 删除连线 | `DeleteConnectionParams` | `ToolResult<void>` |
| 7 | `get_selection_context` | 获取选中上下文 | `GetSelectionContextParams` | `ToolResult<AgentContext>` |
| 8 | `generate_image` | 生成图片 | `GenerateImageParams` | `ToolResult<GenerationResult>` |
| 9 | `generate_video` | 生成视频 | `GenerateVideoParams` | `ToolResult<GenerationResult>` |
| 10 | `export_project` | 导出项目 | `ExportProjectParams` | `ToolResult<string>` |
| 11 | `set_viewport` | 设置视口 | `SetViewportParams` | `ToolResult<ViewportState>` |

---

## 参考文件

- **Demo 完整代码**：`demo/agent-mcp-canvas-loop/`
- **任务 CSV**：`board-import/v1.0-20250101-tasks.csv` (第 12-17 行)
- **编码规范**：`.continue/knowledge/coding-rules.md`
- **Week 1 指南**：`docs/sprint1-w1-task-guide.md`