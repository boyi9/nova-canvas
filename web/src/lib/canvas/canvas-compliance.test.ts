import { describe, it, expect } from "vitest";
import { scanCanvasCompliance } from "./canvas-compliance";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";

function makeNode(id: string, type: CanvasNodeType, title: string, metadata: Partial<CanvasNodeMetadata> = {}): CanvasNodeData {
    return { id, type, title, position: { x: 0, y: 0 }, width: 200, height: 120, metadata: metadata as CanvasNodeMetadata };
}

describe("scanCanvasCompliance", () => {
    it("detects advertising-law violations in node text", () => {
        const node = makeNode("n1", CanvasNodeType.Text, "文案", { content: "这是最好的产品，唯一的选择" });
        const report = scanCanvasCompliance([node]);
        expect(report.totalViolations).toBeGreaterThan(0);
        expect(report.nodes[0].violations.some((violation) => violation.keyword === "最好")).toBe(true);
    });

    it("reports clean content as compliant", () => {
        const node = makeNode("n1", CanvasNodeType.Text, "文案", { content: "优质好物推荐" });
        const report = scanCanvasCompliance([node]);
        expect(report.totalViolations).toBe(0);
    });

    it("scans structured scenario fields such as selling points", () => {
        const node = makeNode("p1", CanvasNodeType.Product, "商品", { productName: "口红", sellingPoints: ["全网最低价"] });
        const report = scanCanvasCompliance([node]);
        expect(report.totalViolations).toBeGreaterThan(0);
    });
});
