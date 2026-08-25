import { describe, it, expect } from "vitest";
import { analyzeAutoLinks } from "./auto-link";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";

function makeNode(id: string, type: CanvasNodeType, title: string, metadata: Partial<CanvasNodeMetadata> = {}): CanvasNodeData {
    return { id, type, title, position: { x: 0, y: 0 }, width: 200, height: 120, metadata: metadata as CanvasNodeMetadata };
}

describe("analyzeAutoLinks", () => {
    it("links a referenced node via explicit @mention", () => {
        const source = makeNode("a", CanvasNodeType.Text, "产品A", { content: "文案" });
        const target = makeNode("b", CanvasNodeType.Image, "素材B", { prompt: "参考 @产品A 生成" });
        const links = analyzeAutoLinks([source, target], []);
        expect(links).toHaveLength(1);
        expect(links[0]).toMatchObject({ fromNodeId: "a", toNodeId: "b" });
    });

    it("links via a unique node-title substring", () => {
        const source = makeNode("a", CanvasNodeType.Product, "限量口红", {});
        const target = makeNode("b", CanvasNodeType.Text, "文案", { content: "主推 限量口红 秋季上新" });
        const links = analyzeAutoLinks([source, target], []);
        expect(links.some((link) => link.fromNodeId === "a" && link.toNodeId === "b")).toBe(true);
    });

    it("does not propose connections that already exist", () => {
        const source = makeNode("a", CanvasNodeType.Text, "产品A", {});
        const target = makeNode("b", CanvasNodeType.Image, "素材B", { prompt: "@产品A" });
        const existing: CanvasConnection[] = [{ id: "x", fromNodeId: "a", toNodeId: "b" }];
        expect(analyzeAutoLinks([source, target], existing)).toHaveLength(0);
    });

    it("wires Product to Storyboard by product name", () => {
        const product = makeNode("p", CanvasNodeType.Product, "口红", { productName: "春季口红" });
        const storyboard = makeNode("s", CanvasNodeType.Storyboard, "春季口红", {});
        const links = analyzeAutoLinks([product, storyboard], []);
        expect(links.some((link) => link.fromNodeId === "p" && link.toNodeId === "s")).toBe(true);
    });

    it("skips ambiguous non-unique titles for loose matching", () => {
        const a = makeNode("a", CanvasNodeType.Product, "商品", {});
        const b = makeNode("b", CanvasNodeType.Product, "商品", {});
        const c = makeNode("c", CanvasNodeType.Text, "文案", { content: "看看 商品 怎么样" });
        expect(analyzeAutoLinks([a, b, c], [])).toHaveLength(0);
    });
});
