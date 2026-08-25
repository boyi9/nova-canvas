import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";

export interface WorkflowNode {
    id: string;
    type: string;
    params: Record<string, unknown>;
    position?: { x: number; y: number };
}

export interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
}

export interface WorkflowGraph {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
}

export interface WorkflowResult {
    node_id: string;
    type: string;
    output?: Record<string, unknown>;
    error?: string;
}

export interface WorkflowRunResponse {
    results: Record<string, WorkflowResult>;
}

export function canvasToWorkflowGraph(nodes: CanvasNodeData[], connections: CanvasConnection[]): WorkflowGraph {
    return {
        nodes: nodes.map((node) => ({
            id: node.id,
            type: node.type,
            position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
            params: { ...node.metadata, title: node.title },
        })),
        edges: connections.map((connection) => ({
            id: connection.id,
            source: connection.fromNodeId,
            target: connection.toNodeId,
        })),
    };
}
