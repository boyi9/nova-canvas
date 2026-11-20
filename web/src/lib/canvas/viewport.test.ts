import { describe, expect, it } from "vitest";

import {
    MAX_ZOOM,
    MIN_ZOOM,
    WHEEL_DELTA_LINE_PX,
    WHEEL_DELTA_PAGE_PX,
    centerViewportOnWorld,
    clampZoom,
    clientToWorld,
    createInitialViewport,
    fitViewportToBounds,
    getVisibleWorldRect,
    getWorldViewportCenter,
    isUntouchedViewport,
    normalizeWheelDelta,
    panViewportBy,
    resizeViewport,
    sanitizeViewport,
    screenDeltaToWorld,
    screenToWorld,
    setZoomAtScreenPoint,
    wheelZoomFactor,
    worldToScreen,
    zoomAtScreenPoint,
} from "./viewport";

describe("clampZoom", () => {
    it("keeps zoom inside the default range", () => {
        expect(clampZoom(1)).toBe(1);
        expect(clampZoom(0.001)).toBe(MIN_ZOOM);
        expect(clampZoom(100)).toBe(MAX_ZOOM);
    });

    it("falls back to 100% only for NaN", () => {
        expect(clampZoom(Number.NaN)).toBe(1);
    });

    it("saturates infinite overflow at the bounds", () => {
        expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(MAX_ZOOM);
        expect(clampZoom(Number.NEGATIVE_INFINITY)).toBe(MIN_ZOOM);
        expect(clampZoom(Number.POSITIVE_INFINITY, MIN_ZOOM, 1)).toBe(1);
    });

    it("accepts a narrower caller range", () => {
        expect(clampZoom(2, MIN_ZOOM, 1)).toBe(1);
    });
});

describe("sanitizeViewport", () => {
    it("returns the world origin for missing data", () => {
        expect(sanitizeViewport(null)).toEqual({ x: 0, y: 0, k: 1 });
        expect(sanitizeViewport(undefined)).toEqual({ x: 0, y: 0, k: 1 });
    });

    it("repairs non-finite fields and clamps zoom", () => {
        const view = sanitizeViewport({ x: Number.NaN, y: 10, k: 0 });
        expect(view.x).toBe(0);
        expect(view.y).toBe(10);
        expect(view.k).toBe(MIN_ZOOM);
    });

    it("clamps persisted zoom above the maximum", () => {
        expect(sanitizeViewport({ x: 1, y: 2, k: 100 }).k).toBe(MAX_ZOOM);
    });

    it("uses the provided fallback for invalid fields", () => {
        expect(sanitizeViewport({ x: Number.NaN, y: 6, k: 2 }, { x: 5, y: 6, k: 2 })).toEqual({ x: 5, y: 6, k: 2 });
    });
});

describe("isUntouchedViewport", () => {
    it("treats the legacy default as unset", () => {
        expect(isUntouchedViewport({ x: 0, y: 0, k: 1 })).toBe(true);
        expect(isUntouchedViewport(null)).toBe(true);
    });

    it("detects explicit viewports", () => {
        expect(isUntouchedViewport({ x: 1, y: 0, k: 1 })).toBe(false);
        expect(isUntouchedViewport({ x: 0, y: 0, k: 2 })).toBe(false);
    });
});

describe("createInitialViewport", () => {
    it("puts the world origin at the container center", () => {
        expect(createInitialViewport(1200, 800)).toEqual({ x: 600, y: 400, k: 1 });
    });

    it("clamps the requested zoom", () => {
        expect(createInitialViewport(100, 100, 10).k).toBe(MAX_ZOOM);
        expect(createInitialViewport(100, 100, 0.001).k).toBe(MIN_ZOOM);
    });

    it("degrades to the top-left for unknown sizes", () => {
        expect(createInitialViewport(0, Number.NaN)).toEqual({ x: 0, y: 0, k: 1 });
    });
});

describe("coordinate conversion", () => {
    const viewport = { x: 120, y: -40, k: 1.5 };
    const point = { x: 33, y: -12 };

    it("converts screen to world and back", () => {
        const world = screenToWorld(viewport, point);
        expect(world.x).toBeCloseTo((33 - 120) / 1.5, 10);
        expect(world.y).toBeCloseTo((-12 + 40) / 1.5, 10);
        const screen = worldToScreen(viewport, world);
        expect(screen.x).toBeCloseTo(point.x, 10);
        expect(screen.y).toBeCloseTo(point.y, 10);
    });

    it("removes the container offset for client coordinates", () => {
        expect(clientToWorld({ x: 0, y: 0, k: 1 }, 250, 150, { left: 100, top: 50 })).toEqual({ x: 150, y: 100 });
        expect(clientToWorld({ x: 0, y: 0, k: 1 }, 250, 150, null)).toEqual({ x: 250, y: 150 });
    });
});

describe("animated zoom", () => {
    it("keeps the world point under the anchor fixed", () => {
        const viewport = { x: 0, y: 0, k: 1 };
        const anchor = { x: 100, y: 50 };
        const before = screenToWorld(viewport, anchor);
        const next = zoomAtScreenPoint(viewport, anchor.x, anchor.y, 2);
        const after = screenToWorld(next, anchor);

        expect(next.k).toBe(2);
        expect(next.x).toBe(-100);
        expect(next.y).toBe(-50);
        expect(after.x).toBeCloseTo(before.x, 10);
        expect(after.y).toBeCloseTo(before.y, 10);
    });

    it("clamps zoom at both ends", () => {
        expect(setZoomAtScreenPoint({ x: 0, y: 0, k: 1 }, 0, 0, 100).k).toBe(MAX_ZOOM);
        expect(setZoomAtScreenPoint({ x: 0, y: 0, k: 1 }, 0, 0, 0.0001).k).toBe(MIN_ZOOM);
    });

    it("ignores invalid factors", () => {
        const viewport = { x: 5, y: 6, k: 2 };
        expect(zoomAtScreenPoint(viewport, 10, 10, 0)).toEqual(viewport);
        expect(zoomAtScreenPoint(viewport, 10, 10, Number.NaN)).toEqual(viewport);
    });

    it("maps wheel deltas to zoom factors", () => {
        expect(wheelZoomFactor(-100)).toBeCloseTo(1.1, 10);
        expect(wheelZoomFactor(100)).toBeCloseTo(1 / 1.1, 10);
        expect(wheelZoomFactor(0)).toBe(1);
    });
});

describe("normalizeWheelDelta", () => {
    it("keeps pixel deltas unchanged", () => {
        expect(normalizeWheelDelta(-100, 0)).toBe(-100);
        expect(normalizeWheelDelta(37, undefined)).toBe(37);
    });

    it("converts line deltas so Firefox wheels still zoom", () => {
        expect(normalizeWheelDelta(-3, 1)).toBe(-3 * WHEEL_DELTA_LINE_PX);
        expect(wheelZoomFactor(normalizeWheelDelta(-3, 1))).toBeCloseTo(Math.pow(1.1, 0.48), 10);
    });

    it("converts page deltas with a caller override", () => {
        expect(normalizeWheelDelta(1, 2)).toBe(WHEEL_DELTA_PAGE_PX);
        expect(normalizeWheelDelta(2, 2, 400)).toBe(800);
    });

    it("returns 0 for invalid or empty deltas", () => {
        expect(normalizeWheelDelta(0, 0)).toBe(0);
        expect(normalizeWheelDelta(Number.NaN, 1)).toBe(0);
        expect(normalizeWheelDelta(Number.POSITIVE_INFINITY, 0)).toBe(0);
    });
});

describe("screenDeltaToWorld", () => {
    it("scales client pixel deltas by the zoom factor", () => {
        expect(screenDeltaToWorld({ x: 100, y: -40, k: 2 }, 20, -10)).toEqual({ x: 10, y: -5 });
        expect(screenDeltaToWorld({ x: 0, y: 0, k: 0.05 }, 10, 20)).toEqual({ x: 200, y: 400 });
    });

    it("ignores invalid components", () => {
        expect(screenDeltaToWorld({ x: 0, y: 0, k: 2 }, Number.NaN, Number.POSITIVE_INFINITY)).toEqual({ x: 0, y: 0 });
        expect(screenDeltaToWorld({ x: 0, y: 0, k: 1 }, 10, 0)).toEqual({ x: 10, y: 0 });
    });
});

describe("panViewportBy", () => {
    it("adds screen deltas without changing zoom", () => {
        expect(panViewportBy({ x: 10, y: 20, k: 2 }, 5, -8)).toEqual({ x: 15, y: 12, k: 2 });
    });
});

describe("getVisibleWorldRect", () => {
    it("converts the container area into world space", () => {
        const rect = getVisibleWorldRect({ x: 100, y: 50, k: 2 }, { width: 800, height: 600 });
        expect(rect).toEqual({ x: -50, y: -25, width: 400, height: 300 });
    });

    it("expands by the requested world padding", () => {
        const rect = getVisibleWorldRect({ x: 100, y: 50, k: 2 }, { width: 800, height: 600 }, 20);
        expect(rect).toEqual({ x: -70, y: -45, width: 440, height: 340 });
    });
});

describe("centerViewportOnWorld", () => {
    it("centers the given world point", () => {
        const viewport = centerViewportOnWorld({ x: 0, y: 0, k: 2 }, { width: 800, height: 600 }, { x: 100, y: 100 });
        expect(viewport).toEqual({ x: 200, y: 100, k: 2 });
        expect(getWorldViewportCenter(viewport, { width: 800, height: 600 })).toEqual({ x: 100, y: 100 });
    });
});

describe("fitViewportToBounds", () => {
    it("fits bounds into the container and centers them", () => {
        const bounds = { x: 0, y: 0, width: 1000, height: 500 };
        const viewport = fitViewportToBounds(bounds, { width: 800, height: 600 });
        expect(viewport.k).toBeCloseTo(0.8, 10);
        const center = worldToScreen(viewport, { x: 500, y: 250 });
        expect(center.x).toBeCloseTo(400, 10);
        expect(center.y).toBeCloseTo(300, 10);
    });

    it("supports ratio padding for focus mode", () => {
        const bounds = { x: 0, y: 0, width: 1000, height: 500 };
        const viewport = fitViewportToBounds(bounds, { width: 800, height: 600 }, { paddingRatio: 0.2, maxZoom: 1 });
        expect(viewport.k).toBeCloseTo(0.48, 10);
    });

    it("respects caller zoom limits", () => {
        const bounds = { x: 0, y: 0, width: 1000, height: 500 };
        expect(fitViewportToBounds(bounds, { width: 800, height: 600 }, { minZoom: 0.9 }).k).toBeCloseTo(0.9, 10);
        expect(fitViewportToBounds(bounds, { width: 800, height: 600 }, { maxZoom: 0.5 }).k).toBeCloseTo(0.5, 10);
    });

    it("falls back to the initial viewport for invalid bounds", () => {
        expect(fitViewportToBounds({ x: 0, y: 0, width: 0, height: 0 }, { width: 800, height: 600 })).toEqual({ x: 400, y: 300, k: 1 });
        expect(fitViewportToBounds(null, { width: 800, height: 600 })).toEqual({ x: 400, y: 300, k: 1 });
    });
});

describe("resizeViewport", () => {
    it("keeps the world center stable when the container resizes", () => {
        const before = { x: 0, y: 0, k: 1 };
        const previousSize = { width: 800, height: 600 };
        const nextSize = { width: 1000, height: 600 };
        const after = resizeViewport(before, previousSize, nextSize);

        expect(after).toEqual({ x: 100, y: 0, k: 1 });
        expect(getWorldViewportCenter(after, nextSize)).toEqual(getWorldViewportCenter(before, previousSize));
    });

    it("centers when the previous size was unknown", () => {
        expect(resizeViewport({ x: 120, y: 80, k: 2 }, { width: 0, height: 0 }, { width: 1000, height: 700 })).toEqual({ x: 500, y: 350, k: 2 });
    });

    it("ignores a collapsed next size", () => {
        expect(resizeViewport({ x: 120, y: 80, k: 2 }, { width: 800, height: 600 }, { width: 0, height: 0 })).toEqual({ x: 120, y: 80, k: 2 });
    });
});
