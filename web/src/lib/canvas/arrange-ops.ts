import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";
import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";
import { layoutEcommerceDetailPage } from "@/lib/canvas/detail-page-layout";

// Build canvas Agent ops that apply the e-commerce detail-page layout: reposition
// nodes whose coordinates changed, then add any missing sequential links.
export function buildArrangeDetailPageOps(nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasAgentOp[] {
    const { nodes: arranged, connections: withLinks } = layoutEcommerceDetailPage(nodes, connections);
    const positionOps: CanvasAgentOp[] = arranged
        .filter((node) => {
            const original = nodes.find((n) => n.id === node.id);
            return !original || original.position.x !== node.position.x || original.position.y !== node.position.y;
        })
        .map((node) => ({ type: "update_node", id: node.id, patch: { position: node.position } }));
    const existing = new Set((connections || []).map((connection) => `${connection.fromNodeId}->${connection.toNodeId}`));
    const linkOps: CanvasAgentOp[] = withLinks
        .filter((connection) => !existing.has(`${connection.fromNodeId}->${connection.toNodeId}`))
        .map((connection) => ({ type: "connect_nodes", fromNodeId: connection.fromNodeId, toNodeId: connection.toNodeId }));
    return [...positionOps, ...linkOps];
}
