/**
 * Timeline 核心类型定义
 * 支持视频/音频/字幕/特效/转场五轨
 */

export type TrackType = "video" | "audio" | "subtitle" | "effect" | "transition";

export type ClipType = "video" | "audio" | "image" | "subtitle" | "effect" | "transition";

export interface TimelineClip {
  id: string;
  trackId: string;
  type: ClipType;
  name: string;
  // 源素材信息
  sourceId: string;           // 素材库 ID
  sourceUrl: string;          // 素材 URL
  sourceDuration: number;     // 素材原始时长(秒)
  // 时间轴位置
  startTime: number;          // 在轨道上的开始时间(秒)
  endTime: number;            // 在轨道上的结束时间(秒)
  // 裁剪信息（相对于源素材）
  trimStart: number;          // 从源素材第几秒开始
  trimEnd: number;            // 到源素材第几秒结束
  // 视觉属性
  color: string;              // 轨道项颜色
  thumbnail?: string;         // 缩略图
  waveform?: number[];        // 音频波形数据
  // 字幕特有
  text?: string;
  fontSize?: number;
  fontColor?: string;
  fontFamily?: string;
  position?: "bottom" | "top" | "center";
  // 特效特有
  effectType?: string;
  effectParams?: Record<string, unknown>;
  // 转场特有
  transitionType?: string;
  transitionDuration?: number;
  // 关键帧动画
  keyframes?: Keyframe[];
  // 元数据
  locked?: boolean;
  muted?: boolean;
  opacity?: number;
  volume?: number;
  playbackRate?: number;
}

export interface Keyframe {
  time: number;           // 相对于片段开始的时间(秒)
  property: string;       // 属性名
  value: unknown;         // 属性值
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

export interface TimelineTrack {
  id: string;
  type: TrackType;
  name: string;
  color: string;
  height: number;
  visible: boolean;
  locked: boolean;
  muted: boolean;
  solo: boolean;
  clips: TimelineClip[];
  order: number;
}

export interface TimelineState {
  tracks: TimelineTrack[];
  duration: number;           // 总时长(秒)
  fps: number;                // 帧率
  resolution: { width: number; height: number };
  playheadPosition: number;   // 当前播放头位置(秒)
  isPlaying: boolean;
  zoomLevel: number;          // 缩放级别 (px per second)
  scrollX: number;            // 水平滚动位置
  selectedClipIds: string[];
  clipboard: TimelineClip[];  // 复制粘贴缓冲区
}

/**
 * 撤销/重做快照：只包含会被恢复的字段。
 * resolution / clipboard 属于组件配置或独立缓冲区，不参与历史回滚。
 */
export type TimelineSnapshot = Pick<
  TimelineState,
  "tracks" | "duration" | "fps" | "playheadPosition" | "isPlaying" | "zoomLevel" | "scrollX" | "selectedClipIds"
>;

export interface TimelineAction {
  // 轨道操作
  addTrack: (type: TrackType, name?: string) => void;
  removeTrack: (trackId: string) => void;
  reorderTracks: (trackIds: string[]) => void;
  toggleTrackVisibility: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  // 片段操作
  addClip: (trackId: string, clip: Omit<TimelineClip, "id">) => string;
  removeClip: (clipId: string) => void;
  moveClip: (clipId: string, trackId: string, startTime: number) => void;
  trimClip: (clipId: string, trimStart: number, trimEnd: number) => void;
  splitClip: (clipId: string, splitTime: number) => string[];
  duplicateClip: (clipId: string) => string;
  // 选择操作
  selectClip: (clipId: string, additive?: boolean) => void;
  clearSelection: () => void;
  // 播放控制
  setPlayhead: (time: number) => void;
  togglePlay: () => void;
  // 视图控制
  setZoom: (zoom: number) => void;
  setScrollX: (x: number) => void;
  // 撤销/重做
  undo: () => void;
  redo: () => void;
  // 复制粘贴
  copyClips: (clipIds: string[]) => void;
  pasteClips: (trackId: string, time: number) => void;
  // 时长
  setDuration: (duration: number) => void;
}

// 默认轨道配置
export const DEFAULT_TRACK_CONFIG: Record<TrackType, { name: string; color: string; height: number }> = {
  video: { name: "视频", color: "#3b82f6", height: 80 },
  audio: { name: "音频", color: "#22c55e", height: 60 },
  subtitle: { name: "字幕", color: "#f59e0b", height: 50 },
  effect: { name: "特效", color: "#ec4899", height: 50 },
  transition: { name: "转场", color: "#6366f1", height: 40 },
};

// 片段类型颜色
export const CLIP_TYPES: readonly ClipType[] = ["video", "audio", "image", "subtitle", "effect", "transition"];

export const CLIP_TYPE_COLORS: Record<ClipType, string> = {
  video: "#3b82f6",
  audio: "#22c55e",
  image: "#8b5cf6",
  subtitle: "#f59e0b",
  effect: "#ec4899",
  transition: "#6366f1",
};

// 时间格式化工具
export function formatTime(seconds: number, fps = 30): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * fps);
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
  return `${mins}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
}

export function parseTime(timeString: string, fps = 30): number {
  const parts = timeString.split(":").map(Number);
  if (parts.length === 4) return parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / fps;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / fps;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

// 生成唯一 ID
export function generateClipId(): string {
  return `clip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function generateTrackId(): string {
  return `track-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}