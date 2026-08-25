import { describe, expect, it } from "vitest";

import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";
import { ecommerceDetailRank, layoutEcommerceDetailPage } from "@/lib/canvas/detail-page-layout";

function node(id: string, type: string, y = 0): CanvasNodeData {
    return { id, type, title: id, position: { x: 0, y }, width: 200, height: 120, metadata: {} };
}

describe("ecommerceDetailRank", () => {
    it("orders text before product before image before video", () => {
        expect(ecommerceDetailRank("text")).toBeLessThan(ecommerceDetailRank("product"));
        expect(ecommerceDetailRank("product")).toBeLessThan(ecommerceDetailRank("image"));
        expect(ecommerceDetailRank("image")).toBeLessThan(ecommerceDetailRank("video"));
    });
    it("gives unknown types the lowest rank", () => {
        expect(ecommerceDetailRank("mystery")).toBe(7);
    });
});

describe("layoutEcommerceDetailPage", () => {
    it("returns input unchanged when there are no nodes", () => {
        const result = layoutEcommerceDetailPage([], []);
        expect(result.nodes).toHaveLength(0);
        expect(result.connections).toHaveLength(0);
    });

    it("repositions nodes into a vertical flow ordered by rank", () => {
        const nodes = [node("v", "video", 500), node("p", "product", 100), node("t", "text", 0)];
        const { nodes: next } = layoutEcommerceDetailPage(nodes, []);
        expect(next[0].id).toBe("t");
        expect(next[1].id).toBe("p");
        expect(next[2].id).toBe("v");
        expect(next[0].position.x).toBe(360);
        expect(next[1].position.y).toBeGreaterThan(next[0].position.y);
    });

    it("adds sequential connections between consecutive nodes without duplicating existing ones", () => {
        const nodes = [node("t", "text"), node("p", "product"), node("v", "video")];
        const existing: CanvasConnection[] = [{ id: "e1", fromNodeId: "t", toNodeId: "p" }];
        const { connections } = layoutEcommerceDetailPage(nodes, existing);
        const keys = connections.map((c) => `${c.fromNodeId}->${c.toNodeId}`);
        expect(keys).toContain("t->p");
        expect(keys).toContain("p->v");
        expect(connections.filter((c) => c.fromNodeId === "t" && c.toNodeId === "p")).toHaveLength(1);
    });
});
