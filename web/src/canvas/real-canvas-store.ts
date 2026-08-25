/**
 * CANVAS-001: 真实Canvas状态管理实现
 * 替换 MCP Demo 中的 MockCanvasStore
 * 对接 nova-canvas 原生数据结构（Node/Connection/Project）
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import type {
  CanvasNode,
  CanvasProject,
  Connection,
  ViewportState,
  NodeType,
  NodeData,
} from '../shared/types';

export class RealCanvasStore extends EventEmitter {
  private projects: Map<string, CanvasProject> = new Map();
  private activeProjectId: string | null = null;

  /** 创建新画布项目 */
  createProject(name: string): CanvasProject {
    const project: CanvasProject = {
      id: `project-${uuidv4().slice(0, 8)}`,
      name,
      version: '1.0.0',
      nodes: [],
      connections: [],
      viewport: { x: 0, y: 0, zoom: 1, rotation: 0 },
      meta: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        author: 'nova-user',
        tags: [],
        description: '',
      },
    };
    this.projects.set(project.id, project);
    if (!this.activeProjectId) this.activeProjectId = project.id;
    this.emit('projectChanged', project);
    return project;
  }

  /** 获取当前活跃项目（核心入口） */
  getActiveProject(): CanvasProject {
    if (!this.activeProjectId) {
      return this.createProject('Untitled');
    }
    return this.projects.get(this.activeProjectId)!;
  }

  /** 切换活跃项目（多画布支持） */
  switchProject(projectId: string): void {
    if (!this.projects.has(projectId)) {
      throw new Error(`Project not found: ${projectId}`);
    }
    this.activeProjectId = projectId;
    this.emit('projectChanged', this.getActiveProject());
  }

  /** 列出所有项目 */
  listProjects(): Array<{ id: string; name: string; nodeCount: number }> {
    return Array.from(this.projects.values()).map((p) => ({
      id: p.id,
      name: p.name,
      nodeCount: p.nodes.length,
    }));
  }

  // ===== 节点操作 =====

  getNodes(nodeIds?: string[]): CanvasNode[] {
    const project = this.getActiveProject();
    if (!nodeIds) return project.nodes;
    return project.nodes.filter((n) => nodeIds.includes(n.id));
  }

  getNode(nodeId: string): CanvasNode | undefined {
    return this.getActiveProject().nodes.find((n) => n.id === nodeId);
  }

  createNode(input: {
    type: NodeType;
    position: { x: number; y: number };
    data: NodeData;
    size?: { width: number; height: number };
  }): CanvasNode {
    const project = this.getActiveProject();
    const node: CanvasNode = {
      id: `node-${uuidv4().slice(0, 8)}`,
      type: input.type,
      position: input.position,
      size: input.size ?? { width: 300, height: 300 },
      data: input.data,
      meta: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        tags: [],
        isLocked: false,
        isHidden: false,
      },
      connections: [],
    };
    project.nodes.push(node);
    this.touch(project);
    this.emit('nodesChanged', project.nodes);
    return node;
  }

  updateNode(
    nodeId: string,
    updates: Partial<Pick<CanvasNode, 'data' | 'position' | 'meta'>>
  ): CanvasNode | null {
    const project = this.getActiveProject();
    const idx = project.nodes.findIndex((n) => n.id === nodeId);
    if (idx === -1) return null;
    project.nodes[idx] = {
      ...project.nodes[idx],
      ...updates,
      meta: { ...project.nodes[idx].meta, ...(updates.meta ?? {}), updatedAt: Date.now() },
    };
    this.touch(project);
    this.emit('nodesChanged', project.nodes);
    return project.nodes[idx];
  }

  deleteNodes(nodeIds: string[]): number {
    const project = this.getActiveProject();
    const before = project.nodes.length;
    project.nodes = project.nodes.filter((n) => !nodeIds.includes(n.id));
    project.connections = project.connections.filter(
      (c) => !nodeIds.includes(c.sourceNodeId) && !nodeIds.includes(c.targetNodeId)
    );
    const deleted = before - project.nodes.length;
    if (deleted > 0) {
      this.touch(project);
      this.emit('nodesChanged', project.nodes);
    }
    return deleted;
  }

  // ===== 连接操作 =====

  connectNodes(input: {
    sourceNodeId: string;
    sourceHandle: string;
    targetNodeId: string;
    targetHandle: string;
    type?: 'data' | 'control';
  }): Connection {
    const project = this.getActiveProject();
    // 校验两端节点存在
    if (!this.getNode(input.sourceNodeId)) {
      throw new Error(`Source node not found: ${input.sourceNodeId}`);
    }
    if (!this.getNode(input.targetNodeId)) {
      throw new Error(`Target node not found: ${input.targetNodeId}`);
    }
    // 防重复连接
    const exists = project.connections.some(
      (c) =>
        c.sourceNodeId === input.sourceNodeId &&
        c.targetNodeId === input.targetNodeId &&
        c.sourceHandle === input.sourceHandle &&
        c.targetHandle === input.targetHandle
    );
    if (exists) {
      throw new Error('Connection already exists');
    }
    const conn: Connection = {
      id: `conn-${uuidv4().slice(0, 8)}`,
      sourceNodeId: input.sourceNodeId,
      sourceHandle: input.sourceHandle,
      targetNodeId: input.targetNodeId,
      targetHandle: input.targetHandle,
      type: input.type ?? 'data',
    };
    project.connections.push(conn);
    this.touch(project);
    this.emit('projectChanged', project);
    return conn;
  }

  /** 获取上游节点（沿连接向上遍历） */
  getUpstreamNodes(nodeId: string, depth = 3): CanvasNode[] {
    const project = this.getActiveProject();
    const visited = new Set<string>();
    const result: CanvasNode[] = [];

    const traverse = (currentId: string, currentDepth: number): void => {
      if (currentDepth > depth || visited.has(currentId)) return;
      visited.add(currentId);
      for (const conn of project.connections) {
        if (conn.targetNodeId === currentId) {
          const node = project.nodes.find((n) => n.id === conn.sourceNodeId);
          if (node) {
            result.push(node);
            traverse(conn.sourceNodeId, currentDepth + 1);
          }
        }
      }
    };

    traverse(nodeId, 1);
    return result;
  }

  // ===== 视口操作 =====

  getViewport(): ViewportState {
    return this.getActiveProject().viewport;
  }

  setViewport(viewport: Partial<ViewportState>): ViewportState {
    const project = this.getActiveProject();
    project.viewport = { ...project.viewport, ...viewport };
    this.touch(project);
    this.emit('viewportChanged', project.viewport);
    return project.viewport;
  }

  // ===== 序列化 / 反序列化（对接 nova-canvas 导入导出） =====

  toJSON(): CanvasProject {
    return this.getActiveProject();
  }

  fromJSON(json: CanvasProject): void {
    // 基本校验：历史画布无缝迁移的关键
    if (!json || !Array.isArray(json.nodes) || !Array.isArray(json.connections)) {
      throw new Error('Invalid canvas project JSON: missing nodes/connections');
    }
    const project: CanvasProject = {
      ...json,
      meta: { ...json.meta, updatedAt: Date.now() },
    };
    this.projects.set(project.id, project);
    this.activeProjectId = project.id;
    this.emit('projectChanged', project);
    this.emit('nodesChanged', project.nodes);
  }

  // ===== 私有工具 =====

  private touch(project: CanvasProject): void {
    project.meta.updatedAt = Date.now();
  }
}