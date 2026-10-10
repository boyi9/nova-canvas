/**
 * 时间轴 → 剪映草稿 桥接。
 *
 * 背景：`video-draft-compiler.ts` 消费的是画布节点（CanvasNodeData），
 * 而时间轴用的是 TimelineClip，两条数据通路原本互不相通，
 * 导致关键帧 / 转场 / 波形永远无法进入草稿。本模块负责转换与发射。
 */
import { saveAs } from "file-saver";

import { createZip } from "@/lib/zip";
import type { Keyframe, TimelineClip, TimelineState, TimelineTrack } from "@/canvas/components/timeline/timelineTypes";

const SEC_TO_US = 1_000_000;

// ── 关键帧 ──────────────────────────────────────────────────────────────

/** 时间轴属性 → 剪映属性键 */
const PROPERTY_MAP: Record<string, string> = {
    opacity: "alpha",
    scale: "scale",
    positionX: "position_x",
    positionY: "position_y",
    rotation: "rotation",
    volume: "volume",
};

interface CommonKeyframe {
    keyframe_list: Array<{ time: number; curve_in: number; curve_out: number; value: number }>;
    property_type: string;
}

/** 把 TimelineClip 的关键帧转成剪映 common_keyframes 结构（微秒）。 */
export function buildCommonKeyframes(clip: TimelineClip): CommonKeyframe[] {
    const list = clip.keyframes ?? [];
    if (list.length === 0) return [];

    const byProperty = new Map<string, Keyframe[]>();
    for (const kf of list) {
        const arr = byProperty.get(kf.property);
        if (arr) arr.push(kf);
        else byProperty.set(kf.property, [kf]);
    }

    const out: CommonKeyframe[] = [];
    for (const [property, frames] of byProperty) {
        const propertyType = PROPERTY_MAP[property];
        if (!propertyType) continue;
        const sorted = [...frames].sort((a, b) => a.time - b.time);
        out.push({
            property_type: propertyType,
            keyframe_list: sorted.map((kf) => ({
                time: Math.round(kf.time * SEC_TO_US),
                curve_in: 0,
                curve_out: 0,
                value: typeof kf.value === "number" ? kf.value : 0,
            })),
        });
    }
    return out;
}

/** 关键帧总数（用于 UI 展示与测试）。 */
export function countKeyframes(clip: TimelineClip): number {
    return (clip.keyframes ?? []).length;
}

// ── 转场 ────────────────────────────────────────────────────────────────

/** 转场类型 → 剪映 transition 标识 */
const TRANSITION_MAP: Record<string, string> = {
    dissolve: "transition_dissolve",
    fade_black: "transition_fade_black",
    fade_white: "transition_fade_white",
    wipe_left: "transition_wipe_left",
    wipe_right: "transition_wipe_right",
    slide_left: "transition_slide_left",
    slide_up: "transition_slide_up",
    zoom_in: "transition_zoom_in",
};

export interface JianyingTransition {
    name: string;
    duration: number; // 微秒
    effect_id: string;
}

/** 转场片段 → 剪映 transition 结构；硬切与非配对转场返回 null。 */
export function buildTransition(clip: TimelineClip): JianyingTransition | null {
    const effectId = TRANSITION_MAP[clip.transitionType ?? ""];
    if (!effectId) return null;
    const durationUs = Math.max(0, Math.round((clip.transitionDuration ?? 0) * SEC_TO_US));
    return { name: clip.transitionType!, duration: durationUs, effect_id: effectId };
}

/** 抽取轨道上所有有效转场。 */
export function collectTransitions(tracks: TimelineTrack[]): Array<JianyingTransition & { clipId: string }> {
    const out: Array<JianyingTransition & { clipId: string }> = [];
    for (const track of tracks) {
        if (track.type !== "transition") continue;
        for (const clip of track.clips) {
            const t = buildTransition(clip);
            if (t) out.push({ ...t, clipId: clip.id });
        }
    }
    return out;
}

// ── 波形 ────────────────────────────────────────────────────────────────

/** 波形 → 剪映 material 的 waveform 字段；无有效数据返回 null（不伪造）。 */
export function buildWaveform(clip: TimelineClip): { peaks: number[] } | null {
    const wf = clip.waveform;
    if (!wf || wf.length === 0) return null;
    if (!wf.some((v) => v > 0)) return null;
    return { peaks: wf.map((v) => Math.max(0, Math.min(1, Number(v.toFixed(4))))) };
}

// ── 草稿装配 ────────────────────────────────────────────────────────────

export interface TimelineDraftSegment {
    id: string;
    trackId: string;
    material_id: string;
    target_timerange: { start: number; duration: number };
    source_timerange: { start: number; duration: number };
    common_keyframes: CommonKeyframe[];
    speed: number;
}

export interface TimelineDraftTrack {
    id: string;
    type: string;
    segments: TimelineDraftSegment[];
}

export interface TimelineDraft {
    tracks: TimelineDraftTrack[];
    duration: number; // 秒
    fps: number;
    resolution: { width: number; height: number };
    transitions: Array<JianyingTransition & { clipId: string }>;
    audio: Array<{ clipId: string; waveform: number[] }>;
}

/** 把整条时间轴装配成草稿结构。 */
export function compileTimelineDraft(state: TimelineState): TimelineDraft {
    const tracks: TimelineDraftTrack[] = [];
    const audio: TimelineDraft["audio"] = [];

    for (const track of state.tracks) {
        if (track.type === "transition") continue; // 转场单独汇总
        const segments: TimelineDraftSegment[] = [];
        for (const clip of track.clips) {
            const start = Math.round(clip.startTime * SEC_TO_US);
            const duration = Math.max(0, Math.round((clip.endTime - clip.startTime) * SEC_TO_US));
            segments.push({
                id: clip.id,
                trackId: clip.trackId,
                material_id: clip.sourceId || clip.id,
                target_timerange: { start, duration },
                source_timerange: {
                    start: Math.round(clip.trimStart * SEC_TO_US),
                    duration: Math.round(Math.max(0, clip.trimEnd - clip.trimStart) * SEC_TO_US),
                },
                common_keyframes: buildCommonKeyframes(clip),
                speed: clip.playbackRate ?? 1,
            });
            if (clip.type === "audio") {
                const wf = buildWaveform(clip);
                if (wf) audio.push({ clipId: clip.id, waveform: wf.peaks });
            }
        }
        if (segments.length > 0) {
            tracks.push({ id: track.id, type: track.type, segments });
        }
    }

    return {
        tracks,
        duration: state.duration,
        fps: state.fps,
        resolution: state.resolution,
        transitions: collectTransitions(state.tracks),
        audio,
    };
}

/** 装配并下载为剪映草稿 zip。 */
export async function exportTimelineJianYingDraft(state: TimelineState, name: string): Promise<void> {
    const draft = compileTimelineDraft(state);
    const payload = {
        draft_name: name || "NovaCanvas",
        duration_us: Math.round(draft.duration * SEC_TO_US),
        fps: draft.fps,
        resolution: draft.resolution,
        tracks: draft.tracks,
        transitions: draft.transitions,
        audio: draft.audio,
    };
    const zip = await createZip([
        { name: "draft_timeline.json", data: JSON.stringify(payload, null, 2) },
    ]);
    saveAs(zip, `${(name || "NovaCanvas").replace(/[^\w\-.]+/g, "_")}.timeline.jianying.zip`);
}