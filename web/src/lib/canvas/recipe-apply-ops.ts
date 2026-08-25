import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";
import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";

// Build canvas Agent ops that recreate a recipe's instantiated graph on the live
// canvas: one add_node per node and one connect_nodes per edge. Reuses the same
// op pipeline the local Agent uses for canvas_create_node / canvas_connect_nodes.
export function buildRecipeApplyOps(nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasAgentOp[] {
    const ops: CanvasAgentOp[] = nodes.map((node) => ({
        type: "add_node",
        id: node.id,
        nodeType: node.type,
        title: node.title,
        position: node.position,
        width: node.width,
        height: node.height,
        metadata: node.metadata,
    }));
    for (const connection of connections) {
        ops.push({ type: "connect_nodes", fromNodeId: connection.fromNodeId, toNodeId: connection.toNodeId });
    }
    return ops;
}
