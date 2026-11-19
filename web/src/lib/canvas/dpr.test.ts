import { afterEach, describe, expect, it, vi } from "vitest";

import { getCanvasBackingSize, getDevicePixelRatio, normalizeDevicePixelRatio, resizeCanvasBackingStore, snapToDevicePixel } from "./dpr";

const originalDpr = window.devicePixelRatio;

function setWindowDpr(value: number) {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value });
}

afterEach(() => {
    setWindowDpr(originalDpr);
});

describe("normalizeDevicePixelRatio", () => {
    it("keeps valid ratios", () => {
        expect(normalizeDevicePixelRatio(2)).toBe(2);
        expect(normalizeDevicePixelRatio(1.5)).toBe(1.5);
    });

    it("falls back to 1 for invalid ratios", () => {
        expect(normalizeDevicePixelRatio(0)).toBe(1);
        expect(normalizeDevicePixelRatio(-2)).toBe(1);
        expect(normalizeDevicePixelRatio(Number.NaN)).toBe(1);
        expect(normalizeDevicePixelRatio(undefined)).toBe(1);
    });
});

describe("getDevicePixelRatio", () => {
    it("reads the window ratio", () => {
        setWindowDpr(2.5);
        expect(getDevicePixelRatio()).toBe(2.5);
    });

    it("falls back when the browser reports an invalid value", () => {
        setWindowDpr(0);
        expect(getDevicePixelRatio()).toBe(1);
    });
});

describe("getCanvasBackingSize", () => {
    it("multiplies CSS size by the ratio and rounds", () => {
        expect(getCanvasBackingSize(320, 180, 2)).toEqual({ width: 640, height: 360, dpr: 2 });
        expect(getCanvasBackingSize(320.4, 180.6, 1.5)).toEqual({ width: 481, height: 271, dpr: 1.5 });
    });

    it("never returns a zero-sized buffer", () => {
        expect(getCanvasBackingSize(0, 0, 2)).toEqual({ width: 1, height: 1, dpr: 2 });
    });
});

describe("snapToDevicePixel", () => {
    it("aligns values to the device pixel grid", () => {
        expect(snapToDevicePixel(10.3, 2)).toBe(10.5);
        expect(snapToDevicePixel(10.3, 1)).toBe(10);
        expect(snapToDevicePixel(-2.4, 2)).toBe(-2.5);
    });

    it("handles non-finite input", () => {
        expect(snapToDevicePixel(Number.NaN, 2)).toBe(0);
    });
});

describe("resizeCanvasBackingStore", () => {
    it("sets the bitmap size, CSS size and DPR transform", () => {
        const setTransform = vi.fn();
        const canvas = {
            width: 0,
            height: 0,
            style: {} as CSSStyleDeclaration,
            getContext: () => ({ setTransform }),
        } as unknown as HTMLCanvasElement;

        const result = resizeCanvasBackingStore(canvas, 320, 180, 2);

        expect(result).toEqual({ width: 640, height: 360, dpr: 2 });
        expect(canvas.width).toBe(640);
        expect(canvas.height).toBe(360);
        expect(canvas.style.width).toBe("320px");
        expect(canvas.style.height).toBe("180px");
        expect(setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    });

    it("returns the computed size when the canvas is missing", () => {
        expect(resizeCanvasBackingStore(null, 100, 50, 1.5)).toEqual({ width: 150, height: 75, dpr: 1.5 });
    });

    it("tolerates a missing 2d context", () => {
        const canvas = { width: 0, height: 0, style: {} as CSSStyleDeclaration, getContext: () => null } as unknown as HTMLCanvasElement;
        expect(() => resizeCanvasBackingStore(canvas, 10, 10, 2)).not.toThrow();
        expect(canvas.width).toBe(20);
    });
});
