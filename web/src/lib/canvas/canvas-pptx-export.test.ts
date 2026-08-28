import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

import { buildPptxSlides } from "./canvas-pptx-export";

const textNode: CanvasNodeData = {
    id: "t1",
    type: CanvasNodeType.Text,
    title: "卖点文案",
    position: { x: 0, y: 0 },
    width: 200,
    height: 120,
    metadata: { content: "熬夜必备精华水", status: "success" },
};

const imageNodeDataUrl: CanvasNodeData = {
    id: "i1",
    type: CanvasNodeType.Image,
    title: "主图",
    position: { x: 240, y: 0 },
    width: 200,
    height: 200,
    metadata: { content: "data:image/png;base64,AAAA", status: "success" },
};

const imageNodeStorage: CanvasNodeData = {
    id: "i2",
    type: CanvasNodeType.Image,
    title: "参考图",
    position: { x: 0, y: 240 },
    width: 200,
    height: 200,
    metadata: { storageKey: "image:abc", status: "success" },
};

describe("buildPptxSlides", () => {
    it("maps a text node to a slide with text", () => {
        const [slide] = buildPptxSlides([textNode]);
        expect(slide.title).toBe("卖点文案");
        expect(slide.text).toBe("熬夜必备精华水");
        expect(slide.imageData).toBeUndefined();
    });

    it("embeds a data-url image directly", () => {
        const [slide] = buildPptxSlides([imageNodeDataUrl]);
        expect(slide.imageData).toBe("data:image/png;base64,AAAA");
        expect(slide.imageStorageKey).toBeUndefined();
    });

    it("keeps a storage key for deferred blob resolution", () => {
        const [slide] = buildPptxSlides([imageNodeStorage]);
        expect(slide.imageData).toBeUndefined();
        expect(slide.imageStorageKey).toBe("image:abc");
    });

    it("produces one slide per node, preserving order", () => {
        const slides = buildPptxSlides([textNode, imageNodeDataUrl, imageNodeStorage]);
        expect(slides).toHaveLength(3);
        expect(slides[0].type).toBe("text");
        expect(slides[1].type).toBe("image");
        expect(slides[2].type).toBe("image");
    });
});
