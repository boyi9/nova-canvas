/**
 * 共享类型定义：Canvas 核心数据结构
 * 供前端/后端/MCP 统一使用，确保类型一致性
 */

export type NodeType =
  | 'reference'
  | 'generation'
  | 'text'
  | 'control'
  | 'style-transfer'
  | 'video';

export type ConnectionType = 'data' | 'control';

export interface NodeData {
  // 通用字段
  prompt?: string;
  negativePrompt?: string;
  textContent?: string;
  model?: string;
  parameters?: Record<string, unknown>;
  // 视频/风格迁移特有
  duration?: number;
  style?: string;
  strength?: number;
  imageUrl?: string;
  referenceNodeIds?: string[];
  [key: string]: unknown;
}

export interface NodeMeta {
  createdAt: number;
  updatedAt: number;
  version: number;
  tags: string[];
  isLocked: boolean;
  isHidden: boolean;
}

export interface CanvasNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  size: { width: number; height: number };
  data: NodeData;
  meta: NodeMeta;
  connections: string[]; // 连接 ID 列表
}

export interface Connection {
  id: string;
  sourceNodeId: string;
  sourceHandle: string;
  targetNodeId: string;
  targetHandle: string;
  type: ConnectionType;
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

export interface CanvasProject {
  id: string;
  name: string;
  version: string;
  nodes: CanvasNode[];
  connections: Connection[];
  viewport: ViewportState;
  meta: ProjectMeta;
}