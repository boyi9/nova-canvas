import { describe, expect, it } from "vitest";

import {
    buildCommonKeyframes,
    buildTransition,
    buildWaveform,
    collectTransitions,
    compileTimelineDraft,
    countKeyframes,
} from "./timeline-draft-bridge";
import type { TimelineClip, TimelineState, TimelineTrack } from "@/canvas/components/timeline/timelineTypes";

const clip = (over: Partial<TimelineClip> = {}): TimelineClip => ({
    id: "c1",
    trackId: "t1",
    type: "video",
    name: "clip",
    sourceId: "src1",
    sourceUrl: "",
    sourceDuration: 10,
    startTime: 1,
    endTime: 5,
    trimStart: 0,
    trimEnd: 4,
    color: "#000",
    ...over,
});

const track = (over: Partial<TimelineTrack> = {}): TimelineTrack => ({
    id: "t1",
    type: "video",
    name: "V",
    color: "#000",
    height: 80,
    visible: true,
    locked: false,
    muted: false,
    solo: false,
    clips: [],
    order: 0,
    ...over,
});

const state = (over: Partial<TimelineState> = {}): TimelineState => ({
    tracks: [],
    duration: 30,
    fps: 30,
    resolution: { width: 1920, height: 1080 },
    playheadPosition: 0,
    isPlaying: false,
    zoomLevel: 50,
    scrollX: 0,
    selectedClipIds: [],
    clipboard: [],
    ...over,
});

describe("buildCommonKeyframes", () => {
    it("empty when no keyframes", () => {
        expect(buildCommonKeyframes(clip())).toEqual([]);
        expect(buildCommonKeyframes(clip({ keyframes: [] }))).toEqual([]);
    });

    it("converts time to microseconds", () => {
        const out = buildCommonKeyframes(clip({ keyframes: [{ time: 1.5, property: "opacity", value: 0.5 }] }));
        expect(out).toHaveLength(1);
        expect(out[0].property_type).toBe("alpha");
        expect(out[0].keyframe_list[0].time).toBe(1_500_000);
        expect(out[0].keyframe_list[0].value).toBe(0.5);
    });

    it("sorts keyframes by time", () => {
        const out = buildCommonKeyframes(
            clip({
                keyframes: [
                    { time: 3, property: "opacity", value: 1 },
                    { time: 0, property: "opacity", value: 0 },
                ],
            }),
        );
        expect(out[0].keyframe_list.map((k) => k.time)).toEqual([0, 3_000_000]);
    });

    it("groups by property", () => {
        const out = buildCommonKeyframes(
            clip({
                keyframes: [
                    { time: 0, property: "opacity", value: 0 },
                    { time: 1, property: "scale", value: 2 },
                ],
            }),
        );
        expect(out).toHaveLength(2);
        expect(out.map((o) => o.property_type).sort()).toEqual(["alpha", "scale"]);
    });

    it("skips unmapped properties", () => {
        const out = buildCommonKeyframes(clip({ keyframes: [{ time: 0, property: "unknownProp", value: 1 }] }));
        expect(out).toEqual([]);
    });

    it("non-numeric value falls back to 0", () => {
        const out = buildCommonKeyframes(clip({ keyframes: [{ time: 0, property: "opacity", value: "auto" }] }));
        expect(out[0].keyframe_list[0].value).toBe(0);
    });

    it("countKeyframes reflects raw list", () => {
        expect(countKeyframes(clip())).toBe(0);
        expect(
            countKeyframes(
                clip({
                    keyframes: [
                        { time: 0, property: "opacity", value: 0 },
                        { time: 1, property: "opacity", value: 1 },
                    ],
                }),
            ),
        ).toBe(2);
    });
});

describe("buildTransition", () => {
    it("returns null for hard cut", () => {
        expect(buildTransition(clip({ type: "transition", transitionType: "cut" }))).toBeNull();
    });

    it("returns null when type missing", () => {
        expect(buildTransition(clip({ type: "transition" }))).toBeNull();
    });

    it("maps dissolve with microsecond duration", () => {
        const t = buildTransition(clip({ type: "transition", transitionType: "dissolve", transitionDuration: 1.5 }));
        expect(t).not.toBeNull();
        expect(t!.effect_id).toBe("transition_dissolve");
        expect(t!.duration).toBe(1_500_000);
    });

    it("zero duration when unspecified", () => {
        const t = buildTransition(clip({ type: "transition", transitionType: "dissolve" }));
        expect(t!.duration).toBe(0);
    });

    it("collects only from transition tracks", () => {
        const tracks = [
            track({ id: "t1", type: "transition", clips: [clip({ type: "transition", transitionType: "wipe_left", transitionDuration: 0.5 })] }),
            track({ id: "t2", type: "video", clips: [clip({ type: "video", transitionType: "dissolve" })] }),
        ];
        const list = collectTransitions(tracks);
        expect(list).toHaveLength(1);
        expect(list[0].clipId).toBe("c1");
        expect(list[0].effect_id).toBe("transition_wipe_left");
    });
});

describe("buildWaveform", () => {
    it("null when absent", () => {
        expect(buildWaveform(clip({ type: "audio" }))).toBeNull();
    });

    it("null when all zeros (不伪造数据)", () => {
        expect(buildWaveform(clip({ type: "audio", waveform: [0, 0, 0] }))).toBeNull();
    });

    it("returns clamped peaks", () => {
        const out = buildWaveform(clip({ type: "audio", waveform: [0.5, 1.4, -0.2] }));
        expect(out).not.toBeNull();
        expect(out!.peaks).toEqual([0.5, 1, 0]);
    });
});

describe("compileTimelineDraft", () => {
    it("produces empty draft for empty timeline", () => {
        const draft = compileTimelineDraft(state());
        expect(draft.tracks).toEqual([]);
        expect(draft.transitions).toEqual([]);
        expect(draft.audio).toEqual([]);
    });

    it("converts clip times to microseconds", () => {
        const draft = compileTimelineDraft(
            state({ tracks: [track({ clips: [clip({ startTime: 2, endTime: 6, trimStart: 1, trimEnd: 3 })] })] }),
        );
        const seg = draft.tracks[0].segments[0];
        expect(seg.target_timerange).toEqual({ start: 2_000_000, duration: 4_000_000 });
        expect(seg.source_timerange).toEqual({ start: 1_000_000, duration: 2_000_000 });
    });

    it("carries keyframes into segments", () => {
        const draft = compileTimelineDraft(
            state({
                tracks: [
                    track({
                        clips: [clip({ keyframes: [{ time: 0, property: "opacity", value: 0 }, { time: 1, property: "opacity", value: 1 }] })],
                    }),
                ],
            }),
        );
        const seg = draft.tracks[0].segments[0];
        expect(seg.common_keyframes).toHaveLength(1);
        expect(seg.common_keyframes[0].keyframe_list).toHaveLength(2);
    });

    it("excludes transition tracks from tracks[] but lists them separately", () => {
        const draft = compileTimelineDraft(
            state({
                tracks: [
                    track({ id: "t1", type: "video", clips: [clip()] }),
                    track({
                        id: "t2",
                        type: "transition",
                        clips: [clip({ id: "tr1", type: "transition", transitionType: "dissolve", transitionDuration: 0.8 })],
                    }),
                ],
            }),
        );
        expect(draft.tracks).toHaveLength(1);
        expect(draft.transitions).toHaveLength(1);
        expect(draft.transitions[0].duration).toBe(800_000);
    });

    it("collects audio waveforms only for audio clips", () => {
        const draft = compileTimelineDraft(
            state({
                tracks: [
                    track({
                        clips: [
                            clip({ id: "a1", type: "audio", waveform: [0.2, 0.8] }),
                            clip({ id: "v1", type: "video", waveform: [0.5] }),
                        ],
                    }),
                ],
            }),
        );
        expect(draft.audio).toHaveLength(1);
        expect(draft.audio[0].clipId).toBe("a1");
    });

    it("skips tracks with no clips", () => {
        const draft = compileTimelineDraft(state({ tracks: [track({ clips: [] })] }));
        expect(draft.tracks).toEqual([]);
    });

    it("passes through fps and resolution", () => {
        const draft = compileTimelineDraft(state({ fps: 60, resolution: { width: 1080, height: 1920 } }));
        expect(draft.fps).toBe(60);
        expect(draft.resolution).toEqual({ width: 1080, height: 1920 });
    });

    it("preserves playback rate", () => {
        const draft = compileTimelineDraft(state({ tracks: [track({ clips: [clip({ playbackRate: 2 })] })] }));
        expect(draft.tracks[0].segments[0].speed).toBe(2);
    });
});