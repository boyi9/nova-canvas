import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g;

export interface RecipeVariable {
    name: string;
    description?: string;
    default?: unknown;
}

export interface RecipeNode {
    id: string;
    type: string;
    params?: Record<string, unknown>;
    position?: { x: number; y: number };
}

export interface RecipeEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
}

export interface RecipeGraph {
    nodes: RecipeNode[];
    edges: RecipeEdge[];
}

export interface Recipe {
    id?: string;
    name: string;
    description?: string;
    variables?: RecipeVariable[];
    graph: RecipeGraph;
}

function collectTexts(node: CanvasNodeData): string[] {
    const m = node.metadata;
    return [
        node.title,
        m?.prompt,
        m?.content,
        m?.composerContent,
        m?.productName,
        m?.price,
        ...(m?.sellingPoints ?? []),
        ...(m?.scenes ?? []),
        ...(m?.clips ?? []),
        ...(m?.modalities ?? []),
        ...(m?.params ? Object.values(m.params) : []),
    ].filter((value): value is string => typeof value === "string");
}

export function extractVariables(nodes: CanvasNodeData[]): string[] {
    const names = new Set<string>();
    for (const node of nodes) {
        for (const text of collectTexts(node)) {
            PLACEHOLDER.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = PLACEHOLDER.exec(text))) names.add(match[1]);
        }
    }
    return [...names];
}

export function canvasToRecipeGraph(nodes: CanvasNodeData[], connections: CanvasConnection[]): RecipeGraph {
    return {
        nodes: nodes.map((node) => ({
            id: node.id,
            type: node.type,
            position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
            params: {
                ...node.metadata,
                title: node.title,
                width: node.width,
                height: node.height,
            },
        })),
        edges: connections.map((connection) => ({
            id: connection.id,
            source: connection.fromNodeId,
            target: connection.toNodeId,
        })),
    };
}

function recipeNodeToCanvas(node: RecipeNode): CanvasNodeData {
    const params = (node.params ?? {}) as Record<string, unknown>;
    const { title, width, height, ...rest } = params;
    const meta = rest as CanvasNodeMetadata;
    return {
        id: node.id,
        type: node.type,
        title: typeof title === "string" ? title : node.id,
        position: {
            x: Math.round(node.position?.x ?? 0),
            y: Math.round(node.position?.y ?? 0),
        },
        width: typeof width === "number" ? width : 200,
        height: typeof height === "number" ? height : 120,
        metadata: meta,
    };
}

function newId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function instantiateRecipeGraph(
    graph: RecipeGraph,
    offset: { x: number; y: number } = { x: 0, y: 0 },
): { nodes: CanvasNodeData[]; connections: CanvasConnection[] } {
    const idMap = new Map<string, string>();
    const nodes = graph.nodes.map((node) => {
        const mapped = newId("recipe");
        idMap.set(node.id, mapped);
        const canvas = recipeNodeToCanvas(node);
        return {
            ...canvas,
            id: mapped,
            position: { x: canvas.position.x + offset.x, y: canvas.position.y + offset.y },
        };
    });
    const connections = graph.edges
        .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
        .map((edge) => ({
            id: newId("conn"),
            fromNodeId: idMap.get(edge.source)!,
            toNodeId: idMap.get(edge.target)!,
        }));
    return { nodes, connections };
}
