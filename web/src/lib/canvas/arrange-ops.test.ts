import { describe, expect, it } from "vitest";

import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";
import { buildArrangeDetailPageOps } from "@/lib/canvas/arrange-ops";

function node(id: string, type: string, x = 0, y = 0): CanvasNodeData {
    return { id, type, title: id, position: { x, y }, width: 200, height: 120, metadata: {} };
}

describe("buildArrangeDetailPageOps", () => {
    it("emits update_node with new position for moved nodes and connect_nodes for links", () => {
        const nodes: CanvasNodeData[] = [node("v", "video", 0, 500), node("p", "product", 0, 100), node("t", "text", 0, 0)];
        const ops = buildArrangeDetailPageOps(nodes, []);
        const moves = ops.filter((op) => op.type === "update_node");
        const links = ops.filter((op) => op.type === "connect_nodes");
        // all three nodes get repositioned into the vertical flow
        expect(moves).toHaveLength(3);
        expect(links).toHaveLength(2);
        const firstMove = moves[0];
        if (firstMove.type !== "update_node") throw new Error("expected update_node");
        expect(firstMove.id).toBe("t");
        expect(firstMove.patch?.position?.x).toBe(360);
    });

    it("does not emit a connect_nodes op for an already-existing link", () => {
        const nodes: CanvasNodeData[] = [node("t", "text", 0, 0), node("p", "product", 0, 0)];
        const existing: CanvasConnection[] = [{ id: "e1", fromNodeId: "t", toNodeId: "p" }];
        const ops = buildArrangeDetailPageOps(nodes, existing);
        const links = ops.filter((op) => op.type === "connect_nodes");
        expect(links).toHaveLength(0);
    });

    it("returns no ops for an empty canvas", () => {
        expect(buildArrangeDetailPageOps([], [])).toHaveLength(0);
    });
});
