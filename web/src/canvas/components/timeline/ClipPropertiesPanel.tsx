import { useMemo, useState } from "react";
import { ClipboardList, Sparkles, Timer, Trash2, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimelineClip, formatTime, CLIP_TYPES, CLIP_TYPE_COLORS, type Keyframe } from "./timelineTypes";
import { addKeyframe, removeKeyframe, updateKeyframe } from "./timeline-animation";

/** 可做关键帧动画的属性 */
const ANIMATABLE_PROPERTIES = [
    { key: "opacity", label: "不透明度" },
    { key: "scale", label: "缩放" },
    { key: "positionX", label: "位置 X" },
    { key: "positionY", label: "位置 Y" },
    { key: "rotation", label: "旋转" },
    { key: "volume", label: "音量" },
];

interface ClipPropertiesPanelProps {
  clips: TimelineClip[];
  onClose: () => void;
  onUpdate: (clipId: string, updates: Partial<TimelineClip>) => void;
}

export function ClipPropertiesPanel({
  clips,
  onClose,
  onUpdate,
}: ClipPropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<"basic" | "animation" | "effects" | "audio">("basic");
  const [newKeyframeProperty, setNewKeyframeProperty] = useState<string>(ANIMATABLE_PROPERTIES[0].key);

  if (clips.length === 0) return null;

  const clip = clips[0];
  const isMulti = clips.length > 1;
  const clipColor = CLIP_TYPE_COLORS[clip.type] || "#6366f1";

  const handleChange = (updates: Partial<TimelineClip>) => {
    if (isMulti) {
      clips.forEach((c) => onUpdate(c.id, updates));
    } else {
      onUpdate(clip.id, updates);
    }
  };

  // ── 关键帧操作（作用于单个选中片段）───────────────────���────────
  const clipSpan = Math.max(0, clip.endTime - clip.startTime);

  const handleAddKeyframe = () => {
    const existing = clip.keyframes ?? [];
    const last = existing.filter((k) => k.property === newKeyframeProperty).at(-1);
    // 新关键帧落在片段末尾，或紧邻上一帧 +10%
    const time = last ? Math.min(clipSpan, last.time + clipSpan * 0.1 || clipSpan) : clipSpan;
    const value = last ? last.value : (newKeyframeProperty === "opacity" ? (clip.opacity ?? 1) : 0);
    onUpdate(clip.id, {
      keyframes: addKeyframe(existing, { time: Number(time.toFixed(3)), property: newKeyframeProperty, value, easing: "linear" }),
    });
  };

  const handleKeyframeChange = (index: number, patch: Partial<Keyframe>) => {
    onUpdate(clip.id, { keyframes: updateKeyframe(clip.keyframes, index, patch) });
  };

  const handleRemoveKeyframe = (index: number) => {
    onUpdate(clip.id, { keyframes: removeKeyframe(clip.keyframes, index) });
  };

  // 基础属性字段
  const basicFields = useMemo(() => [
    { key: "name", label: "名称", type: "text" as const, value: clip.name },
    { key: "type", label: "类型", type: "select" as const, value: clip.type, options: [...CLIP_TYPES] },
    { key: "startTime", label: "开始时间", type: "time" as const, value: clip.startTime, step: 0.033 },
    { key: "endTime", label: "结束时间", type: "time" as const, value: clip.endTime, step: 0.033 },
    { key: "trimStart", label: "源起始", type: "time" as const, value: clip.trimStart, step: 0.033 },
    { key: "trimEnd", label: "源结束", type: "time" as const, value: clip.trimEnd, step: 0.033 },
    { key: "sourceDuration", label: "源时长", type: "time" as const, value: clip.sourceDuration, step: 0.033, readonly: true },
    { key: "locked", label: "锁定", type: "checkbox" as const, value: clip.locked },
    { key: "muted", label: "静音", type: "checkbox" as const, value: clip.muted },
    { key: "opacity", label: "不透明度", type: "range" as const, value: clip.opacity ?? 1, min: 0, max: 1, step: 0.01 },
  ], [clip]);

  const animationFields = useMemo(() => [
    { key: "playbackRate", label: "播放速度", type: "range" as const, value: clip.playbackRate ?? 1, min: 0.1, max: 4, step: 0.01 },
    { key: "volume", label: "音量", type: "range" as const, value: clip.volume ?? 1, min: 0, max: 2, step: 0.01 },
  ], [clip]);

  return (
    <div className="fixed right-0 top-0 bottom-0 w-80 bg-card border-l border-border flex flex-col z-40 animate-slide-in">
      {/* 头部 */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: clipColor }}>
            <span className="text-foreground text-xs font-bold">{clip.type.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <p className="font-medium text-foreground truncate max-w-[160px]">{isMulti ? `${clips.length} clips selected` : clip.name}</p>
            <p className="text-xs text-muted-foreground">{clip.type} · {formatTime(clip.endTime - clip.startTime)}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 标签页 */}
      <div className="flex border-b border-border overflow-x-auto">
        {([
          { id: "basic", label: "基础", icon: ClipboardList },
          { id: "animation", label: "动画", icon: Timer },
          { id: "effects", label: "特效", icon: Sparkles },
          { id: "audio", label: "音频", icon: Volume2 },
        ] as const).map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-1 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <TabIcon className="size-3.5" />
              <span className="ml-1">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {activeTab === "basic" && (
          <div className="space-y-3">
            {basicFields.map((field) => (
              <PropertyField
                key={field.key}
                label={field.label}
                type={field.type}
                value={clip[field.key as keyof typeof clip] as any}
                options={field.options}
                step={field.step}
                min={field.min}
                max={field.max}
                readonly={field.readonly}
                onChange={(v) => handleChange({ [field.key]: v })}
              />
            ))}
          </div>
        )}

        {activeTab === "animation" && (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">关键帧动画</h4>
            <div className="space-y-2">
              {(clip.keyframes ?? []).map((kf, i) => (
                <div key={`${kf.property}-${kf.time}-${i}`} className="flex items-center gap-2 p-2 bg-muted rounded">
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={kf.time}
                    onChange={(e) => handleKeyframeChange(i, { time: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-20 px-2 py-1 bg-background border border-border rounded text-xs text-foreground font-mono"
                    aria-label="关键帧时间(秒)"
                  />
                  <input
                    type="text"
                    value={kf.property}
                    placeholder="属性名"
                    onChange={(e) => handleKeyframeChange(i, { property: e.target.value })}
                    className="flex-1 px-2 py-1 bg-background border border-border rounded text-xs text-foreground"
                    aria-label="关键帧属性"
                  />
                  <input
                    type="text"
                    value={String(kf.value)}
                    placeholder="值"
                    onChange={(e) => {
                      const raw = e.target.value;
                      const num = Number(raw);
                      handleKeyframeChange(i, { value: raw !== "" && !Number.isNaN(num) ? num : raw });
                    }}
                    className="w-24 px-2 py-1 bg-background border border-border rounded text-xs text-foreground"
                    aria-label="关键帧值"
                  />
                  <select
                    value={kf.easing ?? "linear"}
                    onChange={(e) => handleKeyframeChange(i, { easing: e.target.value as Keyframe["easing"] })}
                    className="px-2 py-1 bg-background border border-border rounded text-xs text-foreground"
                    aria-label="缓动"
                  >
                    <option value="linear">Linear</option>
                    <option value="ease-in">Ease In</option>
                    <option value="ease-out">Ease Out</option>
                    <option value="ease-in-out">Ease In-Out</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemoveKeyframe(i)}
                    className="p-1 text-destructive hover:text-destructive/80"
                    title="删除关键帧"
                    aria-label="删除关键帧"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {!(clip.keyframes ?? []).length && (
              <p className="px-1 py-2 text-xs text-muted-foreground">尚未添加关键帧</p>
            )}
            <div className="flex gap-2">
              <select
                value={newKeyframeProperty}
                onChange={(e) => setNewKeyframeProperty(e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-2 py-2 text-xs text-foreground"
                aria-label="新增关键帧属性"
              >
                {ANIMATABLE_PROPERTIES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddKeyframe}
                className="rounded-md border border-primary/50 bg-primary/15 px-3 py-2 text-sm text-primary hover:bg-primary/30"
              >
                + 添加关键帧
              </button>
            </div>
          </div>
        )}

        {activeTab === "effects" && (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">特效参数</h4>
            {clip.effectType && (
              <div className="space-y-2">
                <PropertyField
                  label="特效类型"
                  type="select"
                  value={clip.effectType}
                  options={["blur", "glow", "color-grade", "distort", "particle", "custom"]}
                  onChange={(v) => handleChange({ effectType: v })}
                />
                {Object.entries(clip.effectParams || {}).map(([key, value]) => (
                  <PropertyField
                    key={key}
                    label={key}
                    type="text"
                    value={String(value)}
                    onChange={(v) => handleChange({ effectParams: { ...clip.effectParams, [key]: v } })}
                  />
                ))}
              </div>
            )}
            <button className="w-full px-3 py-2 bg-purple-500/20 border border-purple-500/50 text-purple-400 rounded hover:bg-purple-500/30 text-sm">
              + 添加特效
            </button>
          </div>
        )}

        {activeTab === "audio" && (
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">音频设置</h4>
            <PropertyField
              label="音量"
              type="range"
              value={clip.volume ?? 1}
              min={0}
              max={2}
              step={0.01}
              onChange={(v) => handleChange({ volume: v })}
              showValue
            />
            <PropertyField
              label="淡入 (秒)"
              type="range"
              value={0}
              min={0}
              max={5}
              step={0.1}
              onChange={() => {}}
            />
            <PropertyField
              label="淡出 (秒)"
              type="range"
              value={0}
              min={0}
              max={5}
              step={0.1}
              onChange={() => {}}
            />
            <PropertyField
              label="声像"
              type="range"
              value={0}
              min={-1}
              max={1}
              step={0.01}
              onChange={() => {}}
            />
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="p-3 border-t border-border flex gap-2">
        <button onClick={() => { /* 复制属性 */ }} className="flex-1 px-3 py-2 text-sm border border-border rounded hover:bg-muted">复制属性</button>
        <button onClick={() => { /* 粘贴属性 */ }} className="flex-1 px-3 py-2 text-sm border border-border rounded hover:bg-muted">粘贴属性</button>
        <button onClick={() => { /* 重置 */ }} className="flex-1 px-3 py-2 text-sm border border-red-600 text-red-400 rounded hover:bg-red-500/10">重置</button>
      </div>
    </div>
  );
}

function PropertyField({
  label,
  type,
  value,
  options,
  step,
  min,
  max,
  readonly,
  onChange,
  showValue = false,
}: {
  label: string;
  type: "text" | "time" | "range" | "select" | "checkbox";
  value: any;
  options?: any[];
  step?: number;
  min?: number;
  max?: number;
  readonly?: boolean;
  onChange: (v: any) => void;
  showValue?: boolean;
}) {
  if (readonly) {
    return (
      <div className="flex items-center justify-between text-sm">
        <label className="text-muted-foreground">{label}</label>
        <span className="text-foreground font-mono">{formatTime(value)}</span>
      </div>
    );
  }

  switch (type) {
    case "time":
      return (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-20">{label}</label>
          <input
            type="text"
            defaultValue={formatTime(value)}
            onBlur={(e) => onChange(parseTimeInput(e.target.value))}
            className="flex-1 px-2 py-1 bg-muted border border-border rounded text-xs text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      );
    case "range":
      return (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <label className="text-muted-foreground">{label}</label>
            {showValue && <span className="text-foreground font-mono">{Number(value).toFixed(2)}</span>}
          </div>
          <input
            type="range"
            defaultValue={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full h-2 accent-blue-500"
            disabled={readonly}
          />
        </div>
      );
    case "select":
      return (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-20">{label}</label>
          <select
            defaultValue={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 px-2 py-1 bg-muted border border-border rounded text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {options?.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            defaultChecked={value}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 rounded border-border text-blue-500 focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-foreground">{label}</span>
        </label>
      );
    default:
      return (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-20">{label}</label>
          <input
            type="text"
            defaultValue={value}
            onBlur={(e) => onChange(e.target.value)}
            className="flex-1 px-2 py-1 bg-muted border border-border rounded text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      );
  }
}

function parseTimeInput(input: string): number {
  const parts = input.split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 4) return parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / 30;
  return 0;
}