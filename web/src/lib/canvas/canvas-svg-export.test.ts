import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

import { buildCanvasSvg } from "./canvas-svg-export";

const textNode: CanvasNodeData = {
    id: "t1",
    type: CanvasNodeType.Text,
    title: "卖点文案",
    position: { x: 0, y: 0 },
    width: 200,
    height: 120,
    metadata: { content: "熬夜必备精华水\n第二行", status: "success" },
};

const imageNode: CanvasNodeData = {
    id: "i1",
    type: CanvasNodeType.Image,
    title: "主图",
    position: { x: 240, y: 0 },
    width: 200,
    height: 200,
    metadata: { content: "data:image/png;base64,AAAA", status: "success" },
};

describe("buildCanvasSvg", () => {
    it("returns a valid svg root with viewBox for non-empty nodes", () => {
        const svg = buildCanvasSvg([textNode, imageNode]);
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(svg).toContain("</svg>");
        expect(svg).toContain('viewBox="');
    });

    it("embeds escaped text node content", () => {
        const svg = buildCanvasSvg([textNode]);
        expect(svg).toContain("熬夜必备精华水");
        expect(svg).toContain("第二行");
    });

    it("escapes XML-significant characters", () => {
        const svg = buildCanvasSvg([{ ...textNode, metadata: { content: "a < b & c > d" } }]);
        expect(svg).toContain("a &lt; b &amp; c &gt; d");
        expect(svg).not.toContain("a < b");
    });

    it("embeds image href when metadata.content is a data url", () => {
        const svg = buildCanvasSvg([imageNode]);
        expect(svg).toContain('<image href="data:image/png;base64,AAAA"');
    });

    it("computes a viewBox that frames every node", () => {
        const svg = buildCanvasSvg([textNode, imageNode]);
        expect(svg).toContain('viewBox="-48 -48 536 296"');
    });

    it("renders an empty placeholder svg when there are no nodes", () => {
        const svg = buildCanvasSvg([]);
        expect(svg).toContain("<svg");
        expect(svg).toContain("</svg>");
    });
});
