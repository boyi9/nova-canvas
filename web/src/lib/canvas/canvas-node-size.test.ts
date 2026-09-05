import { describe, expect, it } from "vitest";

import { fitNodeSize, nodeSizeFromRatio } from "./canvas-node-size";

describe("fitNodeSize", () => {
    it("returns original size when within bounds", () => {
        expect(fitNodeSize(100, 100)).toEqual({ width: 100, height: 100 });
    });

    it("scales down when exceeding maxWidth", () => {
        const r = fitNodeSize(1280, 640, 640, 640);
        expect(r.width).toBe(640);
        expect(r.height).toBe(320);
    });

    it("scales down when exceeding maxHeight", () => {
        const r = fitNodeSize(640, 1280, 640, 640);
        expect(r.width).toBe(320);
        expect(r.height).toBe(640);
    });

    it("handles zero dimensions gracefully", () => {
        const r = fitNodeSize(0, 0);
        expect(r.width).toBeGreaterThanOrEqual(1);
        expect(r.height).toBeGreaterThanOrEqual(1);
    });
});

describe("nodeSizeFromRatio", () => {
    it("parses WxH ratio correctly", () => {
        const r = nodeSizeFromRatio("16:9", 800, 600);
        expect(r).not.toBeNull();
        expect(r!.width).toBe(800);
        expect(r!.height).toBeCloseTo(450, 0);
    });

    it("parses WxH with x separator", () => {
        const r = nodeSizeFromRatio("4x3", 800, 600);
        expect(r).not.toBeNull();
        expect(r!.width).toBe(800);
        expect(r!.height).toBeCloseTo(600, 0);
    });

    it("returns base size for extreme ratios", () => {
        const r = nodeSizeFromRatio("100:1", 800, 600);
        expect(r).toEqual({ width: 800, height: 600 });
    });

    it("returns null for invalid format", () => {
        expect(nodeSizeFromRatio("abc", 800, 600)).toBeNull();
    });

    it("returns null for empty string", () => {
        expect(nodeSizeFromRatio("", 800, 600)).toBeNull();
    });
});
