import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";

// Canonical e-commerce detail-page ("爆款详情页") ordering. Lower rank comes first.
const DETAIL_RANK: Record<string, number> = {
    text: 1,
    nova_text: 1,
    product: 2,
    image: 3,
    multimodal: 4,
    storyboard: 4,
    video: 5,
    video_track: 5,
    config: 6,
    recipe: 6,
};

export function ecommerceDetailRank(type: string): number {
    return DETAIL_RANK[type] ?? 7;
}

export interface DetailLayoutOptions {
    startX?: number;
    startY?: number;
    gap?: number;
}

// Arrange nodes into a single vertical detail-page flow following the e-commerce
// rank order, and connect consecutive nodes so the canvas reads top-to-bottom.
// Existing user connections are preserved; only missing sequential links are added.
export function layoutEcommerceDetailPage(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    options: DetailLayoutOptions = {},
): { nodes: CanvasNodeData[]; connections: CanvasConnection[] } {
    if (nodes.length === 0) return { nodes, connections };
    const startX = options.startX ?? 360;
    const startY = options.startY ?? 80;
    const gap = options.gap ?? 64;

    const ordered = [...nodes].sort((a, b) => {
        const rankA = ecommerceDetailRank(a.type);
        const rankB = ecommerceDetailRank(b.type);
        if (rankA !== rankB) return rankA - rankB;
        return a.position.y - b.position.y;
    });

    let cursorY = startY;
    const positions = new Map<string, { x: number; y: number }>();
    for (const node of ordered) {
        positions.set(node.id, { x: startX, y: cursorY });
        cursorY += (node.height || 140) + gap;
    }

    const nextNodes = ordered.map((node) => {
        const pos = positions.get(node.id);
        return pos ? { ...node, position: pos } : node;
    });

    const existing = new Set(connections.map((connection) => `${connection.fromNodeId}->${connection.toNodeId}`));
    const added: CanvasConnection[] = [];
    for (let index = 0; index < ordered.length - 1; index += 1) {
        const from = ordered[index].id;
        const to = ordered[index + 1].id;
        if (!existing.has(`${from}->${to}`)) {
            added.push({ id: `detail-${from}-${to}`, fromNodeId: from, toNodeId: to });
        }
    }

    return { nodes: nextNodes, connections: [...connections, ...added] };
}
