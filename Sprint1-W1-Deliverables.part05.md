| 🟢 **低** | `import-export` | JSON/PNG/PDF 导出格式兼容 |

---

## 🔧 配置说明

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `UPSTREAM_SOURCE_DIR` | `tests/regression/upstream/src` | 上游源码目录 |
| `ANALYSIS_OUTPUT_DIR` | `docs/architecture/canvas-compat` | 分析报告输出目录 |
| `INFINITE_CANVAS_CORE_MODULES` | 见源码 | 核心模块白名单 |

---

## 🧪 测试指令

```bash
# 运行单元测试
pnpm test src/canvas/compat/CANVAS-001/index.test.ts

# 覆盖率
pnpm test:coverage src/canvas/compat/CANVAS-001/
```

---

## ⚠️ 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 扫描到 0 个模块 | 源码目录不存在/路径错误 | 先运行 INFRA-002 提取上游源码 |
| 风险等级全为 low | `assessRisk` 规则未命中 | 检查模块路径是否包含关键字 |
| 破坏性变更为 0 | 当前项目 src 目录为空 | 先建立基础项目结构再对比 |
| 导出解析不全 | 正则不支持 `export default` / `export *` | 扩展 `exportRegex` 支持更多语法 |

---

## 📝 变更记录

| 版本 | 日期 | 变更内容 | 操作人 |
|------|------|----------|--------|
| 1.0.0 | 2025-01-16 | 初始版本：扫描、分析、报告、迁移指南 | [开发者] |

---

## 📚 相关链接

- [infinite-canvas 源码](https://github.com/infinite-canvas/infinite-canvas/tree/main/src)
- [Fabric.js 迁移指南](http://fabricjs.com/docs/)
- [TypeScript AST 解析](https://github.com/typescript-eslint/typescript-eslint)
~~~

### 2.3.3 index.test.ts

~~~typescript
/**
 * CANVAS-001 单元测试
 * Task: S1-W1-D4-01
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  scanSourceDirectory,
  analyzeModule,
  identifyBreakingChanges,
  generateMigrationGuide,
  generateCompatibilityReport,
} from './index.js';

const TEST_OUTPUT_DIR = join(process.cwd(), 'test-output', 'CANVAS-001');
const TEST_SOURCE_DIR = join(TEST_OUTPUT_DIR, 'src');

describe('CANVAS-001: 画布核心引擎兼容性分析', () => {
  beforeEach(() => {
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_SOURCE_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  // 创建模拟源码结构
  function createMockSource() {
    const modules = {
      'canvas/engine/index.ts': `
export class CanvasEngine { constructor() {} render() {} }
export function createEngine() { return new CanvasEngine(); }
export interface EngineConfig { width: number; height: number; }
import { Fabric } from 'fabric';
import { EventEmitter } from 'eventemitter3';
`,
      'canvas/nodes/index.ts': `
export class NodeManager { nodes = new Map(); add() {} remove() {} }
export type NodeType = 'generation' | 'reference';
import { CanvasEngine } from '../engine';
`,
      'canvas/history/index.ts': `
export class HistoryManager { stack = []; push() {} pop() {} undo() {} redo() {} }
export interface HistoryAction { type: string; payload: unknown; }
`,
      'canvas/layers/index.ts': `
export class LayerManager { layers = []; add() {} remove() {} move() {} }
import { NodeManager } from '../nodes';
`,
      'plugins/PluginManager/index.ts': `
export class PluginManager { plugins = new Map(); install() {} uninstall() {} }
export interface Plugin { name: string; version: string; }
`,
      'tools/SelectionTool/index.ts': `
export class SelectionTool { select() {} deselect() {} }
`,
      'utils/helper.ts': `// not a module entry point
export function helper() {}
`,
    };

    for (const [path, content] of Object.entries(modules)) {
      const fullPath = join(TEST_SOURCE_DIR, path);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content);
    }
  }

  describe('scanSourceDirectory', () => {
    it('应该识别所有包含 index.ts 的模块目录', () => {
      createMockSource();
      const modules = scanSourceDirectory(TEST_SOURCE_DIR);

      expect(modules).toContain('canvas/engine');
      expect(modules).toContain('canvas/nodes');
      expect(modules).toContain('canvas/history');
      expect(modules).toContain('canvas/layers');
      expect(modules).toContain('plugins/PluginManager');
      expect(modules).toContain('tools/SelectionTool');
      // utils/helper.ts 不是模块入口（无 index.ts）
      expect(modules).not.toContain('utils');
    });

    it('不存在的目录应返回空数组', () => {
      const modules = scanSourceDirectory('/non/existent/path');
      expect(modules).toEqual([]);
    });
  });

  describe('analyzeModule', () => {
    it('应该解析导出、依赖、复杂度和风险等级', () => {
      createMockSource();
      const analysis = analyzeModule('canvas/engine', TEST_SOURCE_DIR);

      expect(analysis.path).toBe('canvas/engine');
      expect(analysis.exports).toContain('CanvasEngine');
      expect(analysis.exports).toContain('createEngine');
      expect(analysis.exports).toContain('EngineConfig');
      expect(analysis.dependencies).toContain('fabric');
      expect(analysis.dependencies).toContain('eventemitter3');
      expect(analysis.riskLevel).toBe('high'); // canvas/engine 是高风险
      expect(analysis.complexity).toBeDefined();
    });

    it('canvas/nodes 应标记为中风险', () => {
      createMockSource();
      const analysis = analyzeModule('canvas/nodes', TEST_SOURCE_DIR);
      expect(analysis.riskLevel).toBe('medium');
    });

    it('tools/SelectionTool 应标记为低风险', () => {
      createMockSource();
      const analysis = analyzeModule('tools/SelectionTool', TEST_SOURCE_DIR);
      expect(analysis.riskLevel).toBe('low');
    });

    it('不存在的模块应返回空分析', () => {
      const analysis = analyzeModule('non/existent', TEST_SOURCE_DIR);
      expect(analysis.exports).toEqual([]);
      expect(analysis.dependencies).toEqual([]);
    });
  });

  describe('identifyBreakingChanges', () => {
    it('应该检测移除的模块', () => {
      const upstream = [
        { path: 'canvas/engine', exports: ['A', 'B'], dependencies: [], complexity: 'high', riskLevel: 'high', notes: [] },
        { path: 'canvas/old', exports: ['Old'], dependencies: [], complexity: 'low', riskLevel: 'low', notes: [] },
      ];
      const current = [
        { path: 'canvas/engine', exports: ['A', 'B'], dependencies: [], complexity: 'high', riskLevel: 'high', notes: [] },
      ];

      const changes = identifyBreakingChanges(upstream, current);

      expect(changes.some(c => c.module === 'canvas/old' && c.changeType === 'removed')).toBe(true);
    });

    it('应该检测移除的导出', () => {
      const upstream = [
        { path: 'canvas/engine', exports: ['A', 'B', 'C'], dependencies: [], complexity: 'high', riskLevel: 'high', notes: [] },
      ];
      const current = [
        { path: 'canvas/engine', exports: ['A', 'B'], dependencies: [], complexity: 'high', riskLevel: 'high', notes: [] },
      ];

      const changes = identifyBreakingChanges(upstream, current);

      expect(changes.some(c => c.module === 'canvas/engine' && c.changeType === 'api' && c.description.includes('C'))).toBe(true);
    });

    it('应该检测签名变更（导出数量变化）', () => {
      const upstream = [
        { path: 'canvas/engine', exports: ['A', 'B'], dependencies: [], complexity: 'high', riskLevel: 'high', notes: [] },
      ];
      const current = [
        { path: 'canvas/engine', exports: ['A', 'B', 'C', 'D'], dependencies: [], complexity: 'high', riskLevel: 'high', notes: [] },
      ];

      const changes = identifyBreakingChanges(upstream, current);

      expect(changes.some(c => c.module === 'canvas/engine' && c.changeType === 'signature')).toBe(true);
    });

    it('无变更时应返回空数组', () => {
      const upstream = [
        { path: 'canvas/engine', exports: ['A'], dependencies: [], complexity: 'high', riskLevel: 'high', notes: [] },
      ];
      const current = [
        { path: 'canvas/engine', exports: ['A'], dependencies: [], complexity: 'high', riskLevel: 'high', notes: [] },
      ];

      expect(identifyBreakingChanges(upstream, current)).toEqual([]);
    });
  });

  describe('generateMigrationGuide', () => {
    it('应该按严重度排序生成步骤', () => {
      const changes = [
        { module: 'a', changeType: 'api', description: 'low', severity: 'low' as const, workaround: '' },
        { module: 'b', changeType: 'api', description: 'high', severity: 'high' as const, workaround: '' },
        { module: 'c', changeType: 'api', description: 'medium', severity: 'medium' as const, workaround: '' },
      ];

      const guide = generateMigrationGuide(changes);

      expect(guide.length).toBe(3);
      expect(guide[0].module).toBe('b'); // high first
      expect(guide[1].module).toBe('c'); // medium second
      expect(guide[2].module).toBe('a'); // low last
      expect(guide[0].effort).toBe('high');
      expect(guide[1].effort).toBe('medium');
      expect(guide[2].effort).toBe('low');
    });

    it('每个步骤应包含必要字段', () => {
      const changes = [
        { module: 'test', changeType: 'api', description: 'desc', severity: 'high' as const, workaround: 'fix it' },
      ];
      const guide = generateMigrationGuide(changes);

      expect(guide[0]).toMatchObject({
        step: 1,
        module: 'test',
        action: expect.stringContaining('HIGH'),
        effort: 'high',
        dependencies: [],
      });
    });
  });

  describe('generateCompatibilityReport', () => {
    it('应该生成完整的报告文件', () => {
      createMockSource();
      const upstreamModules = [
        { path: 'canvas/engine', exports: ['A'], dependencies: ['fabric'], complexity: 'high', riskLevel: 'high', notes: [] },
      ];
      const currentModules = [
        { path: 'canvas/engine', exports: ['A'], dependencies: ['fabric'], complexity: 'high', riskLevel: 'high', notes: [] },
      ];

      const report = generateCompatibilityReport(upstreamModules, currentModules, TEST_OUTPUT_DIR);

      expect(report.modules.length).toBe(1);
      expect(report.riskSummary.high).toBe(1);
      expect(report.breakingChanges).toEqual([]);
      expect(report.migrationGuide).toEqual([]);

      // 检查文件生成
      expect(existsSync(join(TEST_OUTPUT_DIR, 'compatibility-report.json'))).toBe(true);
      expect(existsSync(join(TEST_OUTPUT_DIR, 'COMPATIBILITY_ANALYSIS.md'))).toBe(true);
    });

    it('报告应包含正确的风险汇总', () => {
      createMockSource();
      const upstreamModules = [
        { path: 'a', exports: [], dependencies: [], complexity: 'high', riskLevel: 'high', notes: [] },
        { path: 'b', exports: [], dependencies: [], complexity: 'medium', riskLevel: 'medium', notes: [] },
        { path: 'c', exports: [], dependencies: [], complexity: 'low', riskLevel: 'low', notes: [] },
      ];
      const currentModules = upstreamModules.map(m => ({ ...m }));

      const report = generateCompatibilityReport(upstreamModules, currentModules, TEST_OUTPUT_DIR);

      expect(report.riskSummary).toEqual({ high: 1, medium: 1, low: 1 });
    });
  });
});
~~~

## 2.4 MCP Demo（Agent 闭环）

**目录**：`demo/agent-mcp-canvas-loop/`

### 2.4.1 package.json

~~~json
{
  "name": "nova-canvas-agent-mcp-demo",
  "version": "1.0.0",
  "description": "MCP Demo: Canvas Node → Prompt → Local Agent (Codex/Claude Code) → Canvas Write-back Loop",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch mcp-server/index.ts",
    "start": "node --loader ts-node/esm mcp-server/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "cross-platform:test": "tsx scripts/cross-platform-test.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.22.4",
    "uuid": "^9.0.1",
    "ws": "^8.16.0",
    "chalk": "^5.3.0",
    "commander": "^12.0.0",
    "yaml": "^2.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/uuid": "^9.0.8",
    "@types/ws": "^8.5.10",
    "typescript": "^5.3.3",
    "tsx": "^4.7.0",
    "vitest": "^1.2.0",
    "eslint": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "packageManager": "pnpm@9.0.0"
}
~~~

### 2.4.2 tsconfig.json

~~~json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "mcp-server/**/*",
    "canvas-bridge/**/*",
    "shared/**/*",
    "scripts/**/*"
  ],
  "exclude": ["node_modules", "dist", "coverage"]
}
~~~

### 2.4.3 shared/types.ts

~~~typescript
/**
 * Nova Canvas MCP Demo - Shared Type Definitions
 * 与 infinite-canvas 核心数据结构对齐
 */

// ============ Canvas 核心数据结构 ============

export interface CanvasNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  size: { width: number; height: number };
  data: NodeData;
  meta: NodeMeta;
  connections: Connection[];
}

export type NodeType =
  | 'generation'
  | 'reference'
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'group'
  | 'output';

export interface NodeData {
  // 通用字段
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  parameters?: Record<string, unknown>;

  // 类型特定字段
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  textContent?: string;

  // 生成结果
  result?: GenerationResult;
}

export interface NodeMeta {
  createdAt: number;
  updatedAt: number;
  version: number;
  tags: string[];
  isLocked: boolean;
  isHidden: boolean;
}

export interface Connection {
  id: string;
  sourceNodeId: string;
  sourceHandle: string;
  targetNodeId: string;
  targetHandle: string;
  type: 'data' | 'control';
}

export interface GenerationResult {
  type: 'image' | 'video' | 'audio' | 'text';
  url: string;
  mimeType: string;
  size: number;
  metadata: Record<string, unknown>;
  generatedAt: number;
}

export interface CanvasProject {
  id: string;
  name: string;
  version: string;
  nodes: CanvasNode[];
  connections: Connection[];
  viewport: ViewportState;
  meta: ProjectMeta;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
}

export interface ProjectMeta {
  createdAt: number;
  updatedAt: number;
  author: string;
  tags: string[];
  description: string;
}

// ============ MCP 协议类型 ============

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments: MCPArgument[];
}

export interface MCPArgument {
  name: string;
  description: string;
  required: boolean;
}

// ============ Agent 交互类型 ============

export interface AgentContext {
  selectedNodeIds: string[];
  upstreamNodeIds: string[];
  canvasProject: CanvasProject;
  userIntent: string;
}

export interface AgentPrompt {
  system: string;
  user: string;
  context: AgentContext;
  availableTools: MCPTool[];
}

export interface AgentResponse {
  type: 'tool_call' | 'text' | 'completion';
  toolCalls?: ToolCall[];
  text?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

// ============ Canvas 操作 Tool 定义 ============

export const CANVAS_TOOLS: MCPTool[] = [
  {
    name: 'canvas.get_nodes',
    description: '获取画布中所有节点或指定节点的详细信息',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' }, description: '节点ID列表，不传则获取所有' },
        includeConnections: { type: 'boolean', default: true },
      },
    },
  },
  {
    name: 'canvas.get_selected_nodes',
    description: '获取当前选中的节点及其上游节点',
    inputSchema: {
      type: 'object',
      properties: {
        includeUpstream: { type: 'boolean', default: true },
        upstreamDepth: { type: 'number', default: 3 },
      },
    },
  },
  {
    name: 'canvas.create_node',
    description: '在画布上创建新节点',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['generation', 'reference', 'text', 'image', 'video', 'audio', 'group', 'output'] },
        position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
        data: { type: 'object', description: '节点数据' },
        connectTo: { type: 'array', items: { type: 'string' }, description: '自动连接到的上游节点ID' },
      },
      required: ['type', 'position'],
    },
  },
  {
    name: 'canvas.update_node',
    description: '更新节点数据或位置',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        data: { type: 'object' },
        position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
        meta: { type: 'object' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'canvas.delete_nodes',
    description: '删除指定节点',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['nodeIds'],
    },
  },
  {
    name: 'canvas.connect_nodes',
    description: '在两个节点之间建立连接',
    inputSchema: {
      type: 'object',
      properties: {
        sourceNodeId: { type: 'string' },
        sourceHandle: { type: 'string' },
        targetNodeId: { type: 'string' },
        targetHandle: { type: 'string' },
        type: { type: 'string', enum: ['data', 'control'] },
      },
      required: ['sourceNodeId', 'sourceHandle', 'targetNodeId', 'targetHandle'],
    },
  },
  {
    name: 'canvas.generate_image',
    description: '调用 AI 生成图片并自动创建节点插回画布',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        negativePrompt: { type: 'string' },
        model: { type: 'string' },
        parameters: { type: 'object' },
        referenceNodeIds: { type: 'array', items: { type: 'string' } },
        insertPosition: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'canvas.generate_video',
    description: '调用 AI 生成视频并自动创建节点插回画布',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        model: { type: 'string' },
        parameters: { type: 'object' },
        referenceNodeIds: { type: 'array', items: { type: 'string' } },
        insertPosition: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'canvas.export_project',
    description: '导出当前画布项目',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['json', 'png', 'pdf'], default: 'json' },
        includeData: { type: 'boolean', default: true },
      },
    },
  },
  {
    name: 'canvas.get_viewport',
    description: '获取当前视口状态',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'canvas.set_viewport',
    description: '设置视口状态（平移、缩放、旋转）',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        zoom: { type: 'number' },
        rotation: { type: 'number' },
      },
    },
  },
];

// ============ Agent 配置 ============

export interface AgentConfig {
  name: 'codex' | 'claude-code';
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  mcpServers: MCPServerConfig[];
}

export interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'websocket';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
}

export const DEFAULT_AGENT_CONFIGS: Record<string, AgentConfig> = {
  codex: {
    name: 'codex',
    command: 'codex',
    args: ['mcp'],
    env: {},
    mcpServers: [
      {
        name: 'nova-canvas',
        transport: 'stdio',
        command: 'node',
        args: ['dist/mcp-server/index.js'],
      },
    ],
  },
  'claude-code': {
    name: 'claude-code',
    command: 'claude',
    args: ['mcp'],
    env: {},
    mcpServers: [
      {
        name: 'nova-canvas',
        transport: 'stdio',
        command: 'node',
        args: ['dist/mcp-server/index.js'],
      },
    ],
  },
};

// ============ 错误类型 ============

export class MCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'MCPError';
  }
}

export class CanvasBridgeError extends Error {
  constructor(
    message: string,
    public code: string,
    public nodeId?: string
  ) {
    super(message);
    this.name = 'CanvasBridgeError';
  }
}
~~~

### 2.4.4 mcp-server/index.ts

~~~typescript
/**
 * Nova Canvas MCP Server - 入口文件
 * 复用 Codex App 插件的注册逻辑，实现本地 Agent 与 Canvas 的双向通信
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServerTransport } from '@modelcontextprotocol/sdk/server/websocket.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  InitializeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';
import { program } from 'commander';
import { CANVAS_TOOLS } from '../shared/types.js';
import { CanvasBridge } from '../canvas-bridge/index.js';
import type { AgentConfig, MCPServerConfig, CanvasProject, CanvasNode } from '../shared/types.js';

// ============ 全局状态 ============

const canvasBridge = new CanvasBridge();
const connectedClients = new Map<string, WebSocket>();
let currentProject: CanvasProject | null = null;
let agentConfig: AgentConfig | null = null;

// ============ MCP Server 初始化 ============

const server = new Server(
  {
    name: 'nova-canvas-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// ============ Tool 处理器 ============

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: CANVAS_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await canvasBridge.executeTool(name, args ?? {});
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// ============ Resource 处理器 ============

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'canvas://project/current',
      name: 'Current Canvas Project',
      description: '当前画布项目的完整状态',
      mimeType: 'application/json',
    },
    {
      uri: 'canvas://nodes/selected',
      name: 'Selected Nodes',
      description: '当前选中的节点及其上游节点',
      mimeType: 'application/json',
    },
    {
      uri: 'canvas://viewport',
      name: 'Viewport State',
      description: '当前视口状态（位置、缩放、旋转）',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  switch (uri) {
    case 'canvas://project/current': {
      const project = currentProject || await canvasBridge.getCurrentProject();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(project, null, 2),
          },
        ],
      };
    }
    case 'canvas://nodes/selected': {
      const nodes = await canvasBridge.getSelectedNodesWithUpstream();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(nodes, null, 2),
          },
        ],
      };
    }
    case 'canvas://viewport': {
      const viewport = await canvasBridge.getViewport();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(viewport, null, 2),
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

// ============ Prompt 处理器 ============

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: 'generate-from-selection',
      description: '基于选中节点生成新内容',
      arguments: [
        { name: 'intent', description: '用户意图描述', required: true },
        { name: 'mode', description: '生成模式', required: false },
      ],
    },
    {
      name: 'refine-node',
      description: '优化现有节点内容',
      arguments: [
        { name: 'nodeId', description: '目标节点ID', required: true },
        { name: 'instruction', description: '优化指令', required: true },
      ],
    },
    {
      name: 'explain-canvas',
      description: '解释当前画布结构和意图',
      arguments: [],
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const selectedNodes = await canvasBridge.getSelectedNodesWithUpstream();
  const context = {
    selectedNodes,
    project: currentProject,
    timestamp: Date.now(),
  };

  switch (name) {
    case 'generate-from-selection': {
      const intent = (args?.intent as string) ?? '';
      const mode = (args?.mode as string) ?? 'auto';
      return {
        description: `基于选中节点生成新内容: ${intent}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `用户意图: ${intent}\n生成模式: ${mode}\n\n选中节点上下文:\n${JSON.stringify(context, null, 2)}\n\n请分析上下文，构建合适的生图 Prompt 并调用相应工具生成内容，生成后自动插回画布。`,
            },
          },
        ],
      };
    }
    case 'refine-node': {
      const nodeId = args?.nodeId as string;
      const instruction = args?.instruction as string;
      const node = selectedNodes.find((n) => n.id === nodeId);
      return {
        description: `优化节点 ${nodeId}: ${instruction}`,
        messages: [
          {
            role: 'user',
            content: {
