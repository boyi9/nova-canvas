import { describe, expect, it } from "vitest";

import {
    TRANSITION_TYPES,
    addKeyframe,
    applyEasing,
    evaluateKeyframes,
    generateWaveform,
    getTransition,
    keyframesForProperty,
    normalizeTransition,
    removeKeyframe,
    resolveClipProperty,
    sortKeyframes,
    updateKeyframe,
    validateTransitionDuration,
} from "./timeline-animation";
import type { Keyframe, TimelineClip } from "./timelineTypes";

const kf = (time: number, property: string, value: unknown, easing?: Keyframe["easing"]): Keyframe => ({
    time,
    property,
    value,
    easing,
});

const clip = (over: Partial<TimelineClip> = {}): TimelineClip => ({
    id: "c1",
    trackId: "t1",
    type: "video",
    name: "clip",
    sourceId: "s",
    sourceUrl: "",
    sourceDuration: 10,
    startTime: 2,
    endTime: 8,
    trimStart: 0,
    trimEnd: 6,
    color: "#000",
    ...over,
});

describe("applyEasing", () => {
    it("linear is identity", () => {
        expect(applyEasing(0.3, "linear")).toBe(0.3);
    });
    it("ease-in accelerates", () => {
        expect(applyEasing(0.5, "ease-in")).toBeCloseTo(0.25);
    });
    it("ease-out decelerates", () => {
        expect(applyEasing(0.5, "ease-out")).toBeCloseTo(0.75);
    });
    it("ease-in-out midpoint", () => {
        expect(applyEasing(0.5, "ease-in-out")).toBeCloseTo(0.5);
    });
    it("clamps out of range", () => {
        expect(applyEasing(-1)).toBe(0);
        expect(applyEasing(2)).toBe(1);
    });
});

describe("keyframe CRUD", () => {
    it("sorts by time", () => {
        const list = sortKeyframes([kf(2, "opacity", 1), kf(0, "opacity", 0)]);
        expect(list.map((k) => k.time)).toEqual([0, 2]);
    });
    it("add appends and sorts", () => {
        const list = addKeyframe([kf(2, "opacity", 1)], kf(0, "opacity", 0));
        expect(list.map((k) => k.time)).toEqual([0, 2]);
    });
    it("add overrides same property+time", () => {
        const list = addKeyframe([kf(1, "opacity", 0.5)], kf(1, "opacity", 0.9));
        expect(list).toHaveLength(1);
        expect(list[0].value).toBe(0.9);
    });
    it("add keeps other properties", () => {
        const list = addKeyframe([kf(1, "scale", 2)], kf(1, "opacity", 0.5));
        expect(list).toHaveLength(2);
    });
    it("remove by index", () => {
        const list = removeKeyframe([kf(0, "a", 1), kf(1, "a", 2)], 0);
        expect(list).toHaveLength(1);
        expect(list[0].time).toBe(1);
    });
    it("remove out of range is safe", () => {
        const src = [kf(0, "a", 1)];
        expect(removeKeyframe(src, 9)).toEqual(src);
    });
    it("update patches fields", () => {
        const list = updateKeyframe([kf(0, "opacity", 0)], 0, { value: 1 });
        expect(list[0].value).toBe(1);
    });
    it("update time re-sorts", () => {
        const list = updateKeyframe([kf(0, "opacity", 0), kf(5, "opacity", 1)], 1, { time: 1 });
        expect(list.map((k) => k.time)).toEqual([0, 1]);
    });
    it("filters by property", () => {
        const list = keyframesForProperty([kf(0, "opacity", 0), kf(1, "scale", 2)], "opacity");
        expect(list).toHaveLength(1);
    });
});

describe("evaluateKeyframes", () => {
    it("returns undefined without keyframes", () => {
        expect(evaluateKeyframes(undefined, "opacity", 1)).toBeUndefined();
        expect(evaluateKeyframes([], "opacity", 1)).toBeUndefined();
    });
    it("single keyframe holds value", () => {
        expect(evaluateKeyframes([kf(3, "opacity", 0.5)], "opacity", 0)).toBe(0.5);
        expect(evaluateKeyframes([kf(3, "opacity", 0.5)], "opacity", 99)).toBe(0.5);
    });
    it("clamps before first / after last", () => {
        const list = [kf(2, "opacity", 0.1), kf(4, "opacity", 0.9)];
        expect(evaluateKeyframes(list, "opacity", 0)).toBe(0.1);
        expect(evaluateKeyframes(list, "opacity", 10)).toBe(0.9);
    });
    it("linear interpolation midpoint", () => {
        const list = [kf(0, "opacity", 0), kf(2, "opacity", 1, "linear")];
        expect(evaluateKeyframes(list, "opacity", 1)).toBeCloseTo(0.5);
    });
    it("easing changes curve", () => {
        const list = [kf(0, "opacity", 0), kf(2, "opacity", 1, "ease-in")];
        expect(evaluateKeyframes(list, "opacity", 1)).toBeCloseTo(0.25);
    });
    it("interpolates across three keyframes", () => {
        const list = [kf(0, "x", 0), kf(2, "x", 10), kf(4, "x", 20)];
        expect(evaluateKeyframes(list, "x", 3)).toBeCloseTo(15);
    });
    it("zero-span keyframes do not divide by zero", () => {
        const list = [kf(1, "x", 5), kf(1, "x", 7)];
        expect(() => evaluateKeyframes(list, "x", 1)).not.toThrow();
    });
    it("string values switch at midpoint", () => {
        const list = [kf(0, "blend", "none"), kf(2, "blend", "multiply")];
        expect(evaluateKeyframes(list, "blend", 0.5)).toBe("none");
        expect(evaluateKeyframes(list, "blend", 1.5)).toBe("multiply");
    });
    it("ignores other properties", () => {
        const list = [kf(0, "scale", 5), kf(2, "scale", 9)];
        expect(evaluateKeyframes(list, "opacity", 1)).toBeUndefined();
    });
});

describe("resolveClipProperty", () => {
    it("falls back to static value when no keyframes", () => {
        expect(resolveClipProperty(clip(), "opacity", 5, 0.8)).toBe(0.8);
    });
    it("uses relative clip time", () => {
        // clip.startTime = 2 → absolute 3 相当于相对 1
        const c = clip({ keyframes: [kf(0, "opacity", 0), kf(2, "opacity", 1)] });
        expect(resolveClipProperty(c, "opacity", 3, 0.5)).toBeCloseTo(0.5);
    });
});

describe("transitions", () => {
    it("catalog is non-empty and unique", () => {
        expect(TRANSITION_TYPES.length).toBeGreaterThan(0);
        expect(new Set(TRANSITION_TYPES.map((t) => t.id)).size).toBe(TRANSITION_TYPES.length);
    });
    it("looks up by id", () => {
        expect(getTransition("dissolve")?.nameEn).toBe("Dissolve");
        expect(getTransition("nope")).toBeUndefined();
        expect(getTransition(undefined)).toBeUndefined();
    });
    it("normalize applies default duration", () => {
        const c = normalizeTransition(clip({ type: "transition", transitionType: "dissolve", endTime: 12 }));
        expect(c.transitionDuration).toBe(1);
    });
    it("normalize clamps to clip span", () => {
        const c = normalizeTransition(
            clip({ type: "transition", transitionType: "dissolve", startTime: 0, endTime: 0.3 }),
        );
        expect(c.transitionDuration).toBeCloseTo(0.3);
    });
    it("validate rejects over-length", () => {
        expect(validateTransitionDuration(5, 2, 10).ok).toBe(false);
    });
    it("validate rejects negative", () => {
        expect(validateTransitionDuration(-1, 5, 5).ok).toBe(false);
    });
    it("validate accepts within both spans", () => {
        expect(validateTransitionDuration(1, 2, 10).ok).toBe(true);
    });
});

describe("generateWaveform", () => {
    it("returns zero-filled buckets without AudioContext", async () => {
        const buf = new ArrayBuffer(8);
        const out = await generateWaveform(buf, 16);
        expect(out).toHaveLength(16);
        expect(out.every((v) => v === 0)).toBe(true);
    });
    it("respects bucket count", async () => {
        const out = await generateWaveform(new ArrayBuffer(8), 32);
        expect(out).toHaveLength(32);
    });
});