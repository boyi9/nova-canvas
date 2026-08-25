import { describe, expect, it } from "vitest";

import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";
import { canvasToWorkflowGraph } from "@/lib/canvas/workflow-run";

function makeNode(id: string, type: string, metadata: Record<string, unknown>): CanvasNodeData {
    return {
        id,
        type,
        title: `节点 ${id}`,
        position: { x: 10, y: 20 },
        width: 200,
        height: 120,
        metadata: metadata as CanvasNodeData["metadata"],
    };
}

describe("workflow-run adapter", () => {
    const nodes: CanvasNodeData[] = [
        makeNode("p1", "product", { productName: "精华", price: "199", sellingPoints: ["买一送一"] }),
        makeNode("s1", "storyboard", { scenes: ["开场"] }),
    ];
    const connections: CanvasConnection[] = [{ id: "c1", fromNodeId: "p1", toNodeId: "s1" }];

    it("maps canvas nodes to workflow graph with metadata as params", () => {
        const graph = canvasToWorkflowGraph(nodes, connections);
        const product = graph.nodes.find((n) => n.id === "p1");
        expect(product?.type).toBe("product");
        expect(product?.params.productName).toBe("精华");
        expect(product?.params.title).toBe("节点 p1");
        expect(graph.edges[0]).toMatchObject({ source: "p1", target: "s1" });
    });

    it("preserves all nodes and edges", () => {
        const graph = canvasToWorkflowGraph(nodes, connections);
        expect(graph.nodes).toHaveLength(2);
        expect(graph.edges).toHaveLength(1);
    });
});
