/**
 * CANVAS-001: Canvas 适配器
 * 统一 Mock/Real 两种实现的 API，供 MCP Server 无差别调用
 */

import type { CanvasNode, CanvasProject, ViewportState, NodeType, NodeData } from '../shared/types';

export interface ICanvasStore {
  getActiveProject(): CanvasProject;
  getNodes(nodeIds?: string[]): CanvasNode[];
  createNode(input: {
    type: NodeType;
    position: { x: number; y: number };
    data: NodeData;
  }): CanvasNode;
  updateNode(
    nodeId: string,
    updates: Partial<Pick<CanvasNode, 'data' | 'position' | 'meta'>>
  ): CanvasNode | null;
  deleteNodes(nodeIds: string[]): number;
  connectNodes(input: {
    sourceNodeId: string;
    sourceHandle: string;
    targetNodeId: string;
    targetHandle: string;
    type?: 'data' | 'control';
  }): unknown;
  getUpstreamNodes(nodeId: string, depth?: number): CanvasNode[];
  getViewport(): ViewportState;
  setViewport(viewport: Partial<ViewportState>): ViewportState;
  toJSON(): CanvasProject;
  fromJSON(json: CanvasProject): void;
}

export class CanvasAdapter {
  constructor(private store: ICanvasStore) {}

  /** 切换底层实现（运行时可替换 Mock/Real） */
  use(store: ICanvasStore): void {
    this.store = store;
  }

  get project(): CanvasProject {
    return this.store.getActiveProject();
  }

  createNode(type: NodeType, x: number, y: number, data: NodeData): CanvasNode {
    return this.store.createNode({ type, position: { x, y }, data });
  }

  deleteNodes(...nodeIds: string[]): number {
    return this.store.deleteNodes(nodeIds);
  }

  importProject(json: CanvasProject): void {
    this.store.fromJSON(json);
  }

  exportProject(): CanvasProject {
    return this.store.toJSON();
  }
}