/**
 * 时间轴动效核心：关键帧插值、转场目录、音频波形
 *
 * 说明：这些是纯函数，供 UI 与导出编译器共用，便于单测。
 */
import type { Keyframe, TimelineClip } from "./timelineTypes";

// ── 缓动函数 ────────────────────────────────────────────────────────────
export type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export function applyEasing(t: number, easing: Easing = "linear"): number {
  const x = Math.min(1, Math.max(0, t));
  switch (easing) {
    case "ease-in":
      return x * x;
    case "ease-out":
      return x * (2 - x);
    case "ease-in-out":
      return x < 0.5 ? 2 * x * x : -1 + (4 - 2 * x) * x;
    default:
      return x;
  }
}

// ── 关键帧操作 ──────────────────────────────────────────────────────────

/** 按时间升序排序（稳定）。 */
export function sortKeyframes(keyframes: Keyframe[]): Keyframe[] {
  return [...keyframes].sort((a, b) => a.time - b.time);
}

/** 新增关键帧；同一属性同一时间点视为覆盖。 */
export function addKeyframe(
  keyframes: Keyframe[] | undefined,
  keyframe: Keyframe,
): Keyframe[] {
  const list = keyframes ?? [];
  const filtered = list.filter((k) => !(k.property === keyframe.property && k.time === keyframe.time));
  return sortKeyframes([...filtered, keyframe]);
}

/** 删除指定索引。 */
export function removeKeyframe(keyframes: Keyframe[] | undefined, index: number): Keyframe[] {
  if (!keyframes || index < 0 || index >= keyframes.length) return keyframes ?? [];
  return keyframes.filter((_, i) => i !== index);
}

/** 更新指定索引（部分字段）。 */
export function updateKeyframe(
  keyframes: Keyframe[] | undefined,
  index: number,
  patch: Partial<Keyframe>,
): Keyframe[] {
  if (!keyframes || index < 0 || index >= keyframes.length) return keyframes ?? [];
  const next = keyframes.map((k, i) => (i === index ? { ...k, ...patch } : k));
  return patch.time !== undefined ? sortKeyframes(next) : next;
}

/** 取某属性在给定时间的关键帧序列（升序）。 */
export function keyframesForProperty(keyframes: Keyframe[] | undefined, property: string): Keyframe[] {
  return sortKeyframes((keyframes ?? []).filter((k) => k.property === property));
}

/** 把 Keyframe.value（unknown）收敛为可动画的 number | string。 */
function toAnimatable(value: unknown): number | string | undefined {
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    return undefined;
}

/**
 * 求某属性在 clip 内相对时间 t 的插值。
 *
 * - 无关键帧 → 返回 undefined（调用方回退到静态值）
 * - 单关键帧 → 返回该值
 * - 区间内 → 按相邻帧 easing 插值
 * - 超出范围 → 取边界值（保持首尾常驻）
 */
export function evaluateKeyframes(
    keyframes: Keyframe[] | undefined,
    property: string,
    t: number,
): number | string | undefined {
    const list = keyframesForProperty(keyframes, property);
    if (list.length === 0) return undefined;
    if (list.length === 1) return toAnimatable(list[0].value);

    const first = list[0];
    if (t <= first.time) return toAnimatable(first.value);
    const last = list[list.length - 1];
    if (t >= last.time) return toAnimatable(last.value);

    for (let i = 0; i < list.length - 1; i++) {
        const a = list[i];
        const b = list[i + 1];
        if (t >= a.time && t <= b.time) {
            const span = b.time - a.time;
            if (span <= 0) return toAnimatable(b.value);
            const ratio = applyEasing((t - a.time) / span, b.easing ?? a.easing ?? "linear");
            return interpolate(a.value, b.value, ratio);
        }
    }
    return toAnimatable(last.value);
}

function interpolate(a: unknown, b: unknown, t: number): number | string | undefined {
    const na = toAnimatable(a);
    const nb = toAnimatable(b);
    if (typeof na === "number" && typeof nb === "number") {
        return na + (nb - na) * t;
    }
    // 非数值属性：在 t>=0.5 时切换到目标值
    if (na === undefined) return nb;
    if (nb === undefined) return na;
    return t >= 0.5 ? nb : na;
}

/** 求 clip 在绝对时间线的某属性值（关键帧优先，否则静态值）。 */
export function resolveClipProperty(
  clip: TimelineClip,
  property: string,
  absoluteTime: number,
  staticValue: number | string | undefined,
): number | string | undefined {
  const relative = absoluteTime - clip.startTime;
  const animated = evaluateKeyframes(clip.keyframes, property, relative);
  return animated !== undefined ? animated : staticValue;
}

// ── 转场 ────────────────────────────────────────────────────────────────

export interface TransitionDef {
  id: string;
  name: string;
  nameEn: string;
  defaultDuration: number;
  /** 是否需要两个相邻片段（否则为叠加转场） */
  requiresPair: boolean;
}

/** 转场目录（与剪映/AE 常见命名对齐）。 */
export const TRANSITION_TYPES: readonly TransitionDef[] = [
  { id: "cut", name: "硬切", nameEn: "Cut", defaultDuration: 0, requiresPair: false },
  { id: "dissolve", name: "叠化", nameEn: "Dissolve", defaultDuration: 1.0, requiresPair: true },
  { id: "fade_black", name: "黑场", nameEn: "Fade to Black", defaultDuration: 0.8, requiresPair: true },
  { id: "fade_white", name: "白场", nameEn: "Fade to White", defaultDuration: 0.8, requiresPair: true },
  { id: "wipe_left", name: "左擦除", nameEn: "Wipe Left", defaultDuration: 0.6, requiresPair: true },
  { id: "wipe_right", name: "右擦除", nameEn: "Wipe Right", defaultDuration: 0.6, requiresPair: true },
  { id: "slide_left", name: "左滑", nameEn: "Slide Left", defaultDuration: 0.5, requiresPair: true },
  { id: "slide_up", name: "上滑", nameEn: "Slide Up", defaultDuration: 0.5, requiresPair: true },
  { id: "zoom_in", name: "放大", nameEn: "Zoom In", defaultDuration: 0.7, requiresPair: true },
];

export function getTransition(id: string | undefined): TransitionDef | undefined {
  if (!id) return undefined;
  return TRANSITION_TYPES.find((t) => t.id === id);
}

/** 规范转场片段：补齐默认时长、裁剪到片段长度内。 */
export function normalizeTransition(clip: TimelineClip): TimelineClip {
  const def = getTransition(clip.transitionType);
  const span = Math.max(0, clip.endTime - clip.startTime);
  const duration = Math.min(
    clip.transitionDuration ?? def?.defaultDuration ?? 0.5,
    span,
  );
  return { ...clip, transitionDuration: Math.max(0, duration) };
}

/** 校验转场时长不得超过两侧片段可承受长度。 */
export function validateTransitionDuration(
  duration: number,
  leftSpan: number,
  rightSpan: number,
): { ok: boolean; reason?: string } {
  const max = Math.min(leftSpan, rightSpan);
  if (duration < 0) return { ok: false, reason: "转场时长不能为负" };
  if (duration > max) {
    return { ok: false, reason: `转场时长不得超过相邻片段较短者（${max.toFixed(2)}s）` };
  }
  return { ok: true };
}

// ── 音频波形 ────────────────────────────────────────────────────────────

/** 波形采样桶数量。 */
export const WAVEFORM_BUCKETS = 120;

/**
 * 由音频字节解码波形峰值（0..1）。
 * 使用 Web Audio 解码；失败时返回全 0（不伪造数据）。
 */
export async function generateWaveform(
  arrayBuffer: ArrayBuffer,
  buckets: number = WAVEFORM_BUCKETS,
): Promise<number[]> {
  const out = new Array<number>(buckets).fill(0);
  const Ctor =
    typeof globalThis !== "undefined"
      ? ((globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  if (!Ctor) return out;
  try {
    const ctx = new Ctor();
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channel = buffer.getChannelData(0);
    const per = Math.max(1, Math.floor(channel.length / buckets));
    for (let i = 0; i < buckets; i++) {
      let peak = 0;
      const start = i * per;
      const end = Math.min(channel.length, start + per);
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j]);
        if (v > peak) peak = v;
      }
      out[i] = Math.min(1, Number(peak.toFixed(4)));
    }
    void ctx.close?.();
    return out;
  } catch {
    return out;
  }
}

/** 从 URL 拉取音频并生成波形；网络/解码失败返回全 0。 */
export async function generateWaveformFromUrl(
  url: string,
  buckets: number = WAVEFORM_BUCKETS,
): Promise<number[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return new Array<number>(buckets).fill(0);
    return await generateWaveform(await res.arrayBuffer(), buckets);
  } catch {
    return new Array<number>(buckets).fill(0);
  }
}