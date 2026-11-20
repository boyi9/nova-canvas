import { describe, expect, it } from "vitest";

import { CanvasNodeType } from "@/types/canvas";

import { getShapeGeometry, resolveShapeStyle } from "./shape-geometry";

describe("resolveShapeStyle", () => {
    it("uses fallbacks when metadata is missing", () => {
        expect(resolveShapeStyle()).toEqual({ fill: "#dbeafe", stroke: "#2563eb", strokeWidth: 2, cornerRadius: 0 });
    });

    it("keeps explicit colors and trims whitespace", () => {
        expect(resolveShapeStyle({ fill: " #f00 ", stroke: "#0f0", strokeWidth: 6, cornerRadius: 12 })).toEqual({
            fill: "#f00",
            stroke: "#0f0",
            strokeWidth: 6,
            cornerRadius: 12,
        });
    });

    it("rejects non-finite or negative numbers", () => {
        expect(resolveShapeStyle({ strokeWidth: Number.NaN, cornerRadius: Number.POSITIVE_INFINITY })).toMatchObject({ strokeWidth: 2, cornerRadius: 0 });
        expect(resolveShapeStyle({ strokeWidth: -4, cornerRadius: -8 })).toMatchObject({ strokeWidth: 0, cornerRadius: 0 });
        expect(resolveShapeStyle({ fill: "   ", stroke: "" })).toMatchObject({ fill: "#dbeafe", stroke: "#2563eb" });
    });
});

describe("getShapeGeometry", () => {
    it("insets a rectangle by half the stroke width", () => {
        expect(getShapeGeometry(CanvasNodeType.Rectangle, 320, 200, { strokeWidth: 2, cornerRadius: 16 })).toEqual({
            kind: "rect",
            x: 1,
            y: 1,
            width: 318,
            height: 198,
            rx: 16,
        });
    });

    it("clamps the corner radius to half of the shorter side", () => {
        expect(getShapeGeometry(CanvasNodeType.Rectangle, 100, 60, { strokeWidth: 0, cornerRadius: 999 })).toMatchObject({ rx: 30 });
    });

    it("fills the node bounds when the stroke is disabled", () => {
        expect(getShapeGeometry(CanvasNodeType.Rectangle, 100, 60, { strokeWidth: 0 })).toEqual({
            kind: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 60,
            rx: 0,
        });
    });

    it("maps a circle node to a centred ellipse", () => {
        expect(getShapeGeometry(CanvasNodeType.Circle, 240, 240, { strokeWidth: 2 })).toEqual({
            kind: "ellipse",
            cx: 120,
            cy: 120,
            rx: 119,
            ry: 119,
        });
    });

    it("keeps ellipses usable when the node is not square", () => {
        expect(getShapeGeometry(CanvasNodeType.Circle, 300, 200, { strokeWidth: 2 })).toEqual({
            kind: "ellipse",
            cx: 150,
            cy: 100,
            rx: 149,
            ry: 99,
        });
    });

    it("never produces negative dimensions", () => {
        expect(getShapeGeometry(CanvasNodeType.Rectangle, 1, 1, { strokeWidth: 10 })).toMatchObject({ width: 0, height: 0 });
        expect(getShapeGeometry(CanvasNodeType.Circle, Number.NaN, -20, { strokeWidth: 2 })).toEqual({ kind: "ellipse", cx: 0, cy: 0, rx: 0, ry: 0 });
    });
});
