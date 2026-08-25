import { describe, expect, it } from "vitest";

import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";
import { buildRecipeApplyOps } from "@/lib/canvas/recipe-apply-ops";

function node(id: string, type: string): CanvasNodeData {
    return {
        id,
        type,
        title: `节点 ${id}`,
        position: { x: 10, y: 20 },
        width: 200,
        height: 120,
        metadata: { productName: "精华" },
    };
}

describe("buildRecipeApplyOps", () => {
    const nodes: CanvasNodeData[] = [node("a", "product"), node("b", "storyboard")];
    const connections: CanvasConnection[] = [{ id: "c1", fromNodeId: "a", toNodeId: "b" }];

    it("emits one add_node op per node with full fields", () => {
        const ops = buildRecipeApplyOps(nodes, connections);
        const addOps = ops.filter((op) => op.type === "add_node");
        expect(addOps).toHaveLength(2);
        const first = addOps[0];
        if (first.type !== "add_node") throw new Error("expected add_node");
        expect(first.id).toBe("a");
        expect(first.nodeType).toBe("product");
        expect(first.title).toBe("节点 a");
        expect(first.position).toEqual({ x: 10, y: 20 });
        expect(first.metadata).toMatchObject({ productName: "精华" });
    });

    it("emits one connect_nodes op per connection", () => {
        const ops = buildRecipeApplyOps(nodes, connections);
        const connectOps = ops.filter((op) => op.type === "connect_nodes");
        expect(connectOps).toHaveLength(1);
        const conn = connectOps[0];
        if (conn.type !== "connect_nodes") throw new Error("expected connect_nodes");
        expect(conn.fromNodeId).toBe("a");
        expect(conn.toNodeId).toBe("b");
    });

    it("returns only add_node ops when there are no connections", () => {
        const ops = buildRecipeApplyOps(nodes, []);
        expect(ops).toHaveLength(2);
        expect(ops.every((op) => op.type === "add_node")).toBe(true);
    });
});
