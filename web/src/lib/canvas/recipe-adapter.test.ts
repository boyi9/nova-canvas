import { describe, expect, it } from "vitest";

import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";
import {
    canvasToRecipeGraph,
    extractVariables,
    instantiateRecipeGraph,
    type RecipeGraph,
} from "@/lib/canvas/recipe-adapter";

function makeNode(id: string, title: string, metadata: Record<string, unknown> = {}, position = { x: id.length * 10, y: 0 }): CanvasNodeData {
    return {
        id,
        type: "product",
        title,
        position,
        width: 200,
        height: 120,
        metadata: metadata as CanvasNodeData["metadata"],
    };
}

describe("recipe-adapter", () => {
    const nodes: CanvasNodeData[] = [
        makeNode("n1", "{{brand}} 直播", { productName: "{{brand}} 精华", sellingPoints: ["买{{brand}}送正装"] }),
        makeNode("n2", "普通节点", { prompt: "无变量" }),
    ];
    const connections: CanvasConnection[] = [{ id: "c1", fromNodeId: "n1", toNodeId: "n2" }];

    it("extracts unique {{var}} variables from node fields", () => {
        expect(extractVariables(nodes).sort()).toEqual(["brand"]);
    });

    it("round-trips canvas -> recipe graph -> canvas preserving metadata and titles", () => {
        const graph = canvasToRecipeGraph(nodes, connections);
        expect(graph.nodes).toHaveLength(2);
        expect(graph.edges[0]).toMatchObject({ source: "n1", target: "n2" });

        const { nodes: out, connections: outConns } = instantiateRecipeGraph(graph);
        expect(out).toHaveLength(2);
        const restored = out.find((node) => node.metadata?.productName === "{{brand}} 精华");
        expect(restored?.title).toBe("{{brand}} 直播");
        expect(outConns).toHaveLength(1);
    });

    it("remaps node ids and keeps edges referencing valid new ids", () => {
        const graph: RecipeGraph = {
            nodes: [
                { id: "a", type: "text", position: { x: 0, y: 0 }, params: { title: "A" } },
                { id: "b", type: "text", position: { x: 100, y: 0 }, params: { title: "B" } },
            ],
            edges: [{ id: "e1", source: "a", target: "b" }],
        };
        const { nodes: out, connections } = instantiateRecipeGraph(graph, { x: 40, y: 40 });
        const ids = out.map((node) => node.id);
        expect(new Set(ids).size).toBe(2);
        expect(out.find((n) => n.title === "A")?.position).toEqual({ x: 40, y: 40 });
        expect(out.find((n) => n.title === "B")?.position).toEqual({ x: 140, y: 40 });
        for (const conn of connections) {
            expect(ids).toContain(conn.fromNodeId);
            expect(ids).toContain(conn.toNodeId);
        }
    });

    it("drops edges whose endpoints are missing from the graph", () => {
        const graph: RecipeGraph = {
            nodes: [{ id: "a", type: "text", position: { x: 0, y: 0 }, params: { title: "A" } }],
            edges: [{ id: "e1", source: "a", target: "ghost" }],
        };
        const { connections } = instantiateRecipeGraph(graph);
        expect(connections).toHaveLength(0);
    });
});
