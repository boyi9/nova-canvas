              type: 'text',
              text: `目标节点: ${nodeId}\n优化指令: ${instruction}\n\n节点当前数据:\n${JSON.stringify(node?.data, null, 2)}\n\n请根据指令优化节点内容，完成后更新节点。`,
            },
          },
        ],
      };
    }
    case 'explain-canvas': {
      return {
        description: '解释当前画布结构',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `当前画布项目:\n${JSON.stringify(currentProject, null, 2)}\n\n请分析画布结构、节点关系、创作意图，并给出优化建议。`,
            },
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

// ============ 初始化处理器 ============

server.setRequestHandler(InitializeRequestSchema, async (request) => {
  const { clientInfo } = request.params;
  console.log(chalk.green(`[MCP] Client connected: ${clientInfo?.name} v${clientInfo?.version}`));
  return {
    protocolVersion: '2024-11-05',
    capabilities: server.getCapabilities(),
    serverInfo: { name: 'nova-canvas-mcp', version: '1.0.0' },
  };
});

// ============ Canvas Bridge 事件监听 ============

canvasBridge.on('projectChanged', (project: CanvasProject) => {
  currentProject = project;
  broadcastToClients({ type: 'projectChanged', data: project });
});

canvasBridge.on('nodesChanged', (nodes: CanvasNode[]) => {
  broadcastToClients({ type: 'nodesChanged', data: nodes });
});

canvasBridge.on('viewportChanged', (viewport) => {
  broadcastToClients({ type: 'viewportChanged', data: viewport });
});

// ============ WebSocket 广播 ============

function broadcastToClients(message: unknown) {
  const data = JSON.stringify(message);
  for (const [, ws] of connectedClients) {
    if (ws.readyState === 1) {
      ws.send(data);
    }
  }
}

// ============ CLI 入口 ============

program
  .name('nova-canvas-mcp')
  .description('Nova Canvas MCP Server - 本地 Agent 与 Canvas 双向通信桥接')
  .version('1.0.0')
  .option('-t, --transport <type>', '传输方式: stdio | websocket', 'stdio')
  .option('-p, --port <number>', 'WebSocket 端口', '3001')
  .option('-c, --config <path>', 'Agent 配置文件路径')
  .option('--codex', '使用 Codex Agent 配置')
  .option('--claude-code', '使用 Claude Code Agent 配置')
  .action(async (options) => {
    const transport = options.transport as 'stdio' | 'websocket';
    const port = parseInt(options.port, 10);

    // 加载 Agent 配置
    if (options.codex) {
      const { DEFAULT_AGENT_CONFIGS } = await import('../shared/types.js');
      agentConfig = DEFAULT_AGENT_CONFIGS.codex;
      console.log(chalk.blue('[Config] 使用 Codex Agent 配置'));
    } else if (options.claudeCode) {
      const { DEFAULT_AGENT_CONFIGS } = await import('../shared/types.js');
      agentConfig = DEFAULT_AGENT_CONFIGS['claude-code'];
      console.log(chalk.blue('[Config] 使用 Claude Code Agent 配置'));
    } else if (options.config) {
      // TODO: 从文件加载配置
    }

    // 初始化 Canvas Bridge
    await canvasBridge.initialize();
    console.log(chalk.green('[Canvas] Bridge 初始化完成'));

    // 启动传输层
    if (transport === 'stdio') {
      const stdioTransport = new StdioServerTransport();
      await server.connect(stdioTransport);
      console.log(chalk.green('[MCP] Server running on stdio'));
    } else if (transport === 'websocket') {
      const wss = new WebSocketServerTransport({ port });
      wss.on('connection', (ws) => {
        const clientId = uuidv4();
        connectedClients.set(clientId, ws);
        console.log(chalk.cyan(`[WS] Client connected: ${clientId}`));

        ws.on('close', () => {
          connectedClients.delete(clientId);
          console.log(chalk.yellow(`[WS] Client disconnected: ${clientId}`));
        });

        ws.on('message', async (data) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.type === 'canvasEvent') {
              await canvasBridge.handleCanvasEvent(message.event, message.payload);
            }
          } catch (error) {
            console.error(chalk.red('[WS] Message parse error:'), error);
          }
        });
      });
      await server.connect(wss);
      console.log(chalk.green(`[MCP] Server running on WebSocket port ${port}`));
    }
  });

program.parse();

// ============ 优雅关闭 ============

process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n[Shutdown] 收到 SIGINT，正在关闭...'));
  await server.close();
  await canvasBridge.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('\n[Shutdown] 收到 SIGTERM，正在关闭...'));
  await server.close();
  await canvasBridge.shutdown();
  process.exit(0);
});
~~~

### 2.4.5 canvas-bridge/index.ts

~~~typescript
/**
 * Nova Canvas Bridge - Canvas 与 MCP Server 的桥接层
 * 实现：节点读取 → Prompt 构建 → 本地 Agent 调用 → 画布回写的完整闭环
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type {
  CanvasNode,
  CanvasProject,
  ViewportState,
  AgentContext,
  AgentPrompt,
  AgentResponse,
  ToolCall,
  ToolResult,
  GenerationResult,
  MCPTool,
  CANVAS_TOOLS,
} from '../shared/types.js';

// ============ 模拟 Canvas 存储（实际应对接 infinite-canvas 核心） ============

class MockCanvasStore {
  private project: CanvasProject;
  private listeners: Map<string, Set<Function>> = new Map();

  constructor() {
    this.project = this.createDemoProject();
  }

  private createDemoProject(): CanvasProject {
    return {
      id: 'demo-project-001',
      name: 'Nova Canvas Demo Project',
      version: '1.0.0',
      nodes: [
        {
          id: 'node-ref-001',
          type: 'reference',
          position: { x: 100, y: 100 },
          size: { width: 300, height: 300 },
          data: {
            imageUrl: 'https://picsum.photos/seed/reference1/512/512',
            prompt: 'A beautiful sunset over mountains, photorealistic',
          },
          meta: {
            createdAt: Date.now() - 3600000,
            updatedAt: Date.now() - 3600000,
            version: 1,
            tags: ['reference', 'landscape'],
            isLocked: false,
            isHidden: false,
          },
          connections: [],
        },
        {
          id: 'node-gen-001',
          type: 'generation',
          position: { x: 500, y: 100 },
          size: { width: 300, height: 300 },
          data: {
            prompt: 'Sunset over mountains, oil painting style, vibrant colors',
            model: 'seedream-5.0',
            parameters: {
              steps: 30,
              cfgScale: 7.5,
              width: 1024,
              height: 1024,
            },
          },
          meta: {
            createdAt: Date.now() - 1800000,
            updatedAt: Date.now() - 1800000,
            version: 1,
            tags: ['generated', 'oil-painting'],
            isLocked: false,
            isHidden: false,
          },
          connections: [
            {
              id: 'conn-001',
              sourceNodeId: 'node-ref-001',
              sourceHandle: 'output',
              targetNodeId: 'node-gen-001',
              targetHandle: 'reference',
              type: 'data',
            },
          ],
        },
        {
          id: 'node-text-001',
          type: 'text',
          position: { x: 100, y: 500 },
          size: { width: 400, height: 100 },
          data: {
            textContent: '品牌主视觉设计方案 v1.0\n核心概念：自然与科技的融合',
          },
          meta: {
            createdAt: Date.now() - 600000,
            updatedAt: Date.now() - 600000,
            version: 1,
            tags: ['brief', 'brand'],
            isLocked: false,
            isHidden: false,
          },
          connections: [],
        },
      ],
      connections: [
        {
          id: 'conn-001',
          sourceNodeId: 'node-ref-001',
          sourceHandle: 'output',
          targetNodeId: 'node-gen-001',
          targetHandle: 'reference',
          type: 'data',
        },
      ],
      viewport: {
        x: 0,
        y: 0,
        zoom: 1,
        rotation: 0,
      },
      meta: {
        createdAt: Date.now() - 7200000,
        updatedAt: Date.now(),
        author: 'demo-user',
        tags: ['demo', 'brand-design'],
        description: '演示项目：品牌主视觉设计流程',
      },
    };
  }

  getProject(): CanvasProject {
    return this.project;
  }

  updateProject(updater: (project: CanvasProject) => void): void {
    updater(this.project);
    this.project.meta.updatedAt = Date.now();
    this.emit('projectChanged', this.project);
  }

  getNode(nodeId: string): CanvasNode | undefined {
    return this.project.nodes.find((n) => n.id === nodeId);
  }

  getNodes(nodeIds?: string[]): CanvasNode[] {
    if (!nodeIds) return this.project.nodes;
    return this.project.nodes.filter((n) => nodeIds.includes(n.id));
  }

  createNode(node: Omit<CanvasNode, 'id'>): CanvasNode {
    const newNode: CanvasNode = {
      ...node,
      id: `node-${uuidv4().slice(0, 8)}`,
    };
    this.project.nodes.push(newNode);
    this.emit('nodesChanged', this.project.nodes);
    this.emit('projectChanged', this.project);
    return newNode;
  }

  updateNode(nodeId: string, updates: Partial<CanvasNode>): CanvasNode | null {
    const index = this.project.nodes.findIndex((n) => n.id === nodeId);
    if (index === -1) return null;
    this.project.nodes[index] = { ...this.project.nodes[index], ...updates };
    this.emit('nodesChanged', this.project.nodes);
    this.emit('projectChanged', this.project);
    return this.project.nodes[index];
  }

  deleteNodes(nodeIds: string[]): void {
    this.project.nodes = this.project.nodes.filter((n) => !nodeIds.includes(n.id));
    this.project.connections = this.project.connections.filter(
      (c) => !nodeIds.includes(c.sourceNodeId) && !nodeIds.includes(c.targetNodeId)
    );
    this.emit('nodesChanged', this.project.nodes);
    this.emit('projectChanged', this.project);
  }

  connectNodes(connection: {
    sourceNodeId: string;
    sourceHandle: string;
    targetNodeId: string;
    targetHandle: string;
    type: 'data' | 'control';
  }): void {
    const newConn = { ...connection, id: `conn-${uuidv4().slice(0, 8)}` };
    this.project.connections.push(newConn);
    this.emit('projectChanged', this.project);
  }

  getViewport(): ViewportState {
    return this.project.viewport;
  }

  setViewport(viewport: Partial<ViewportState>): void {
    this.project.viewport = { ...this.project.viewport, ...viewport };
    this.emit('viewportChanged', this.project.viewport);
    this.emit('projectChanged', this.project);
  }

  getSelectedNodes(): CanvasNode[] {
    // 模拟：返回第一个 generation 类型节点作为选中
    return this.project.nodes.filter((n) => n.type === 'generation');
  }

  getUpstreamNodes(nodeId: string, depth: number = 3): CanvasNode[] {
    const visited = new Set<string>();
    const result: CanvasNode[] = [];

    function traverse(currentId: string, currentDepth: number) {
      if (currentDepth > depth || visited.has(currentId)) return;
      visited.add(currentId);

      const connections = this.project.connections.filter(
        (c) => c.targetNodeId === currentId
      );
      for (const conn of connections) {
        const node = this.getNode(conn.sourceNodeId);
        if (node) {
          result.push(node);
          traverse(conn.sourceNodeId, currentDepth + 1);
        }
      }
    }

    traverse.call(this, nodeId, 1);
    return result;
  }

  // EventEmitter 接口
  on(event: string, listener: Function): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off(event: string, listener: Function): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
    return true;
  }
}

// ============ Canvas Bridge 核心类 ============

export class CanvasBridge extends EventEmitter {
  private store: MockCanvasStore;
  private wsServer?: any;
  private isInitialized = false;

  constructor() {
    super();
    this.store = new MockCanvasStore();

    // 转发 store 事件
    this.store.on('projectChanged', (project) => this.emit('projectChanged', project));
    this.store.on('nodesChanged', (nodes) => this.emit('nodesChanged', nodes));
    this.store.on('viewportChanged', (viewport) => this.emit('viewportChanged', viewport));
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // 这里可以连接真实的 infinite-canvas 核心
    // 例如：建立 WebSocket 连接到前端、注入 content script 等

    this.isInitialized = true;
    console.log('[CanvasBridge] 初始化完成');
  }

  async shutdown(): Promise<void> {
    this.isInitialized = false;
    console.log('[CanvasBridge] 已关闭');
  }

  // ============ 核心查询方法 ============

  async getCurrentProject(): Promise<CanvasProject> {
    return this.store.getProject();
  }

  async getSelectedNodesWithUpstream(): Promise<CanvasNode[]> {
    const selected = this.store.getSelectedNodes();
    const result = [...selected];

    for (const node of selected) {
      const upstream = this.store.getUpstreamNodes(node.id);
      result.push(...upstream);
    }

    // 去重
    const unique = new Map<string, CanvasNode>();
    for (const node of result) {
      unique.set(node.id, node);
    }
    return Array.from(unique.values());
  }

  async getViewport(): Promise<ViewportState> {
    return this.store.getViewport();
  }

  // ============ Tool 执行入口 ============

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    console.log(`[CanvasBridge] 执行 Tool: ${name}`, args);

    switch (name) {
      case 'canvas.get_nodes':
        return this.toolGetNodes(args);
      case 'canvas.get_selected_nodes':
        return this.toolGetSelectedNodes(args);
      case 'canvas.create_node':
        return this.toolCreateNode(args);
      case 'canvas.update_node':
        return this.toolUpdateNode(args);
      case 'canvas.delete_nodes':
        return this.toolDeleteNodes(args);
      case 'canvas.connect_nodes':
        return this.toolConnectNodes(args);
      case 'canvas.generate_image':
        return this.toolGenerateImage(args);
      case 'canvas.generate_video':
        return this.toolGenerateVideo(args);
      case 'canvas.export_project':
        return this.toolExportProject(args);
      case 'canvas.get_viewport':
        return this.toolGetViewport(args);
      case 'canvas.set_viewport':
        return this.toolSetViewport(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ============ 具体 Tool 实现 ============

  private async toolGetNodes(args: { nodeIds?: string[]; includeConnections?: boolean }) {
    const nodes = this.store.getNodes(args.nodeIds);
    let result = { nodes };

    if (args.includeConnections) {
      const project = this.store.getProject();
      result = { ...result, connections: project.connections };
    }

    return result;
  }

  private async toolGetSelectedNodes(args: { includeUpstream?: boolean; upstreamDepth?: number }) {
    const selected = this.store.getSelectedNodes();
    let result = { nodes: selected };

    if (args.includeUpstream) {
      const depth = args.upstreamDepth ?? 3;
      const upstreamNodes: CanvasNode[] = [];
      for (const node of selected) {
        const upstream = this.store.getUpstreamNodes(node.id, depth);
        upstreamNodes.push(...upstream);
      }
      // 去重
      const unique = new Map<string, CanvasNode>();
      for (const node of upstreamNodes) {
        unique.set(node.id, node);
      }
      result = { ...result, upstreamNodes: Array.from(unique.values()) };
    }

    return result;
  }

  private async toolCreateNode(args: {
    type: CanvasNode['type'];
    position: { x: number; y: number };
    data: CanvasNode['data'];
    connectTo?: string[];
  }) {
    const node = this.store.createNode({
      type: args.type,
      position: args.position,
      size: { width: 300, height: 300 },
      data: args.data,
      meta: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        tags: [],
        isLocked: false,
        isHidden: false,
      },
      connections: [],
    });

    // 自动连接到上游节点
    if (args.connectTo) {
      for (const targetId of args.connectTo) {
        this.store.connectNodes({
          sourceNodeId: targetId,
          sourceHandle: 'output',
          targetNodeId: node.id,
          targetHandle: 'input',
          type: 'data',
        });
      }
    }

    return { success: true, node };
  }

  private async toolUpdateNode(args: {
    nodeId: string;
    data?: CanvasNode['data'];
    position?: { x: number; y: number };
    meta?: CanvasNode['meta'];
  }) {
    const node = this.store.updateNode(args.nodeId, {
      data: args.data,
      position: args.position,
      meta: args.meta ? { ...args.meta, updatedAt: Date.now() } : { updatedAt: Date.now() },
    });

    if (!node) {
      throw new Error(`Node not found: ${args.nodeId}`);
    }

    return { success: true, node };
  }

  private async toolDeleteNodes(args: { nodeIds: string[] }) {
    this.store.deleteNodes(args.nodeIds);
    return { success: true, deletedCount: args.nodeIds.length };
  }

  private async toolConnectNodes(args: {
    sourceNodeId: string;
    sourceHandle: string;
    targetNodeId: string;
    targetHandle: string;
    type: 'data' | 'control';
  }) {
    this.store.connectNodes(args);
    return { success: true };
  }

  private async toolGenerateImage(args: {
    prompt: string;
    negativePrompt?: string;
    model?: string;
    parameters?: Record<string, unknown>;
    referenceNodeIds?: string[];
    insertPosition?: { x: number; y: number };
  }) {
    console.log('[CanvasBridge] 生成图片:', args.prompt);

    // 模拟 AI 生成过程
    await this.simulateGeneration(3000);

    // 创建结果节点
    const position = args.insertPosition ?? {
      x: Math.random() * 800 + 100,
      y: Math.random() * 600 + 100,
    };

    const resultUrl = `https://picsum.photos/seed/${uuidv4()}/1024/1024`;

    const node = this.store.createNode({
      type: 'generation',
      position,
      size: { width: 300, height: 300 },
      data: {
        prompt: args.prompt,
        negativePrompt: args.negativePrompt,
        model: args.model ?? 'seedream-5.0',
        parameters: args.parameters,
        imageUrl: resultUrl,
        result: {
          type: 'image',
          url: resultUrl,
          mimeType: 'image/png',
          size: 1024 * 1024,
          metadata: {
            model: args.model ?? 'seedream-5.0',
            prompt: args.prompt,
            parameters: args.parameters,
          },
          generatedAt: Date.now(),
        },
      },
      meta: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        tags: ['generated', 'image'],
        isLocked: false,
        isHidden: false,
      },
      connections: [],
    });

    // 自动连接参考节点
    if (args.referenceNodeIds) {
      for (const refId of args.referenceNodeIds) {
        this.store.connectNodes({
          sourceNodeId: refId,
          sourceHandle: 'output',
          targetNodeId: node.id,
          targetHandle: 'reference',
          type: 'data',
        });
      }
    }

    return {
      success: true,
      node,
      message: '图片生成完成并已插回画布',
    };
  }

  private async toolGenerateVideo(args: {
    prompt: string;
    model?: string;
    parameters?: Record<string, unknown>;
    referenceNodeIds?: string[];
    insertPosition?: { x: number; y: number };
  }) {
    console.log('[CanvasBridge] 生成视频:', args.prompt);

    // 模拟视频生成（耗时更长）
    await this.simulateGeneration(8000);

    const position = args.insertPosition ?? {
      x: Math.random() * 800 + 100,
      y: Math.random() * 600 + 100,
    };

    const resultUrl = `https://example.com/videos/${uuidv4()}.mp4`;

    const node = this.store.createNode({
      type: 'generation',
      position,
      size: { width: 300, height: 200 },
      data: {
        prompt: args.prompt,
        model: args.model ?? 'seedance-2.0',
        parameters: args.parameters,
        videoUrl: resultUrl,
        result: {
          type: 'video',
          url: resultUrl,
          mimeType: 'video/mp4',
          size: 5 * 1024 * 1024,
          metadata: {
            model: args.model ?? 'seedance-2.0',
            prompt: args.prompt,
            parameters: args.parameters,
          },
          generatedAt: Date.now(),
        },
      },
      meta: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        tags: ['generated', 'video'],
        isLocked: false,
        isHidden: false,
      },
      connections: [],
    });

    if (args.referenceNodeIds) {
      for (const refId of args.referenceNodeIds) {
        this.store.connectNodes({
          sourceNodeId: refId,
          sourceHandle: 'output',
          targetNodeId: node.id,
          targetHandle: 'reference',
          type: 'data',
        });
      }
    }

    return {
      success: true,
      node,
      message: '视频生成完成并已插回画布',
    };
  }

  private async toolExportProject(args: { format?: 'json' | 'png' | 'pdf'; includeData?: boolean }) {
    const project = this.store.getProject();

    if (args.format === 'json' || !args.format) {
      return {
        success: true,
        format: 'json',
        data: args.includeData ? project : { ...project, nodes: [], connections: [] },
      };
    }

    // PNG/PDF 导出需要前端渲染配合，这里返回引导信息
    return {
      success: false,
      format: args.format,
      message: `${args.format.toUpperCase()} 导出需要前端 Canvas 渲染配合，请在前端调用导出 API`,
      projectId: project.id,
    };
  }

  private async toolGetViewport(): Promise<ViewportState> {
    return this.store.getViewport();
  }

  private async toolSetViewport(args: Partial<ViewportState>): Promise<{ success: boolean; viewport: ViewportState }> {
    this.store.setViewport(args);
    return { success: true, viewport: this.store.getViewport() };
  }

  // ============ 画布事件处理（来自前端 WebSocket） ============

  async handleCanvasEvent(event: string, payload: unknown): Promise<void> {
    console.log(`[CanvasBridge] 收到画布事件: ${event}`);

    switch (event) {
      case 'nodeSelected':
        // 选中节点变化，可以触发 Agent 上下文更新
        break;
      case 'nodeMoved':
        // 节点移动，同步位置
        if (payload && typeof payload === 'object' && 'nodeId' in payload && 'position' in payload) {
          this.store.updateNode(payload.nodeId as string, { position: payload.position as { x: number; y: number } });
        }
        break;
      case 'nodeDataChanged':
        // 节点数据变化
        if (payload && typeof payload === 'object' && 'nodeId' in payload && 'data' in payload) {
          this.store.updateNode(payload.nodeId as string, { data: payload.data as CanvasNode['data'] });
        }
        break;
      case 'viewportChanged':
        // 视口变化
        if (payload && typeof payload === 'object') {
          this.store.setViewport(payload as ViewportState);
        }
        break;
      default:
        console.log(`[CanvasBridge] 未处理的事件: ${event}`);
    }
  }

  // ============ 辅助方法 ============

  private async simulateGeneration(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 导出单例
export const canvasBridge = new CanvasBridge();
~~~

### 2.4.6 scripts/cross-platform-test.ts

~~~typescript
/**
 * 跨平台验证测试脚本
 * 在 Windows/macOS/Linux 各执行 50 次全流程验证
 */

import { CanvasBridge } from '../canvas-bridge/index.js';
import type { CanvasNode, AgentContext } from '../shared/types.js';
import chalk from 'chalk';

interface TestResult {
  platform: string;
  testName: string;
  iteration: number;
  success: boolean;
  duration: number;
  error?: string;
  details?: Record<string, unknown>;
}

interface TestSummary {
  platform: string;
  total: number;
  passed: number;
  failed: number;
  avgDuration: number;
  errors: Map<string, number>;
}

const PLATFORMS = ['win32', 'darwin', 'linux'] as const;
const ITERATIONS_PER_PLATFORM = 50;

const TEST_CASES = [
  {
    name: 'MCP Server 启动与初始化',
    fn: async (bridge: CanvasBridge) => {
      await bridge.initialize();
      const project = await bridge.getCurrentProject();
      if (!project || !project.id) throw new Error('Project not loaded');
      return { projectId: project.id };
    },
  },
  {
    name: '获取选中节点及上游节点',
    fn: async (bridge: CanvasBridge) => {
      const nodes = await bridge.getSelectedNodesWithUpstream();
      if (nodes.length === 0) throw new Error('No nodes found');
      return { nodeCount: nodes.length };
    },
  },
  {
    name: 'Tool: canvas.get_selected_nodes',
    fn: async (bridge: CanvasBridge) => {
      const result = await bridge.executeTool('canvas.get_selected_nodes', {
        includeUpstream: true,
        upstreamDepth: 3,
      });
      if (!result || typeof result !== 'object' || !('nodes' in result)) {
        throw new Error('Invalid tool result');
      }
      return { nodesCount: (result as { nodes: unknown[] }).nodes.length };
    },
  },
  {
    name: 'Tool: canvas.generate_image 完整闭环',
    fn: async (bridge: CanvasBridge) => {
      const selectedNodes = await bridge.getSelectedNodesWithUpstream();
      const refNode = selectedNodes.find((n) => n.type === 'reference');

      const result = await bridge.executeTool('canvas.generate_image', {
        prompt: 'A futuristic cityscape at sunset, cyberpunk style, neon lights, high detail',
        negativePrompt: 'blurry, low quality, distorted',
        model: 'seedream-5.0',
        parameters: { steps: 20, cfgScale: 7.0, width: 1024, height: 1024 },
        referenceNodeIds: refNode ? [refNode.id] : [],
        insertPosition: { x: 900, y: 100 },
      });

      if (!result || typeof result !== 'object' || !(result as { success?: boolean }).success) {
        throw new Error('Image generation failed');
      }
      return { nodeId: (result as { node?: { id: string } }).node?.id };
    },
  },
  {
    name: 'Tool: canvas.generate_video 完整闭环',
    fn: async (bridge: CanvasBridge) => {
      const result = await bridge.executeTool('canvas.generate_video', {
        prompt: 'Camera pans across a futuristic cityscape at sunset, cinematic lighting',
        model: 'seedance-2.0',
        parameters: { duration: 5, fps: 24, width: 1024, height: 576 },
        insertPosition: { x: 900, y: 500 },
      });

      if (!result || typeof result !== 'object' || !(result as { success?: boolean }).success) {
        throw new Error('Video generation failed');
      }
      return { nodeId: (result as { node?: { id: string } }).node?.id };
    },
  },
  {
    name: 'Tool: canvas.create_node + connect_nodes 组合',
    fn: async (bridge: CanvasBridge) => {
      // 创建参考节点
      const refNode = await bridge.executeTool('canvas.create_node', {
        type: 'reference',
        position: { x: 100, y: 700 },
        data: { imageUrl: 'https://picsum.photos/seed/test-ref/512/512' },
      });

      if (!(result as { success?: boolean }).success) throw new Error('Create ref node failed');
      const refNodeId = (result as { node: { id: string } }).node.id;

      // 创建生成节点并自动连接
