import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatTime, type TrackType } from "./timelineTypes";

interface TimelineToolbarProps {
  duration: number;
  fps: number;
  playheadPosition: number;
  isPlaying: boolean;
  zoomLevel: number;
  setZoomLevel: (zoom: number) => void;
  setDuration: (duration: number) => void;
  onPlayToggle: () => void;
  onPlayheadChange: (time: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAddTrack: (type: TrackType, name?: string) => void;
}

export function TimelineToolbar({
  duration,
  fps,
  playheadPosition,
  isPlaying,
  zoomLevel,
  setZoomLevel,
  setDuration,
  onPlayToggle,
  onPlayheadChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAddTrack,
}: TimelineToolbarProps) {
  const [timeInput, setTimeInput] = useState(formatTime(playheadPosition));
  const [durationInput, setDurationInput] = useState(String(duration));

  const handleTimeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const time = parseTimeInput(timeInput);
    if (time !== null) onPlayheadChange(time);
  };

  const handleDurationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dur = parseFloat(durationInput);
    if (!isNaN(dur) && dur > 0) setDuration(dur);
  };

  function parseTimeInput(input: string): number | null {
    const parts = input.split(":").map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 4) return parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / 30;
    return null;
  }

  return (
    <div className="h-12 bg-card border-b border-border flex items-center justify-between px-4">
      {/* 左侧：播放控制 */}
      <div className="flex items-center gap-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          title="撤销 (Ctrl+Z)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1.5 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          title="重做 (Ctrl+Y)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
          </svg>
        </button>

        <div className="w-px h-6 bg-muted mx-2" />

        <button
          onClick={onPlayToggle}
          className={cn(
            "p-2 rounded-lg transition-colors",
            isPlaying ? "bg-red-500 hover:bg-red-600" : "bg-muted hover:bg-muted"
          )}
          title={isPlaying ? "暂停 (Space)" : "播放 (Space)"}
        >
          {isPlaying ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          onClick={() => onPlayheadChange(0)}
          className="p-1.5 rounded hover:bg-muted"
          title="回到开头 (Home)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="11 19 2 12 11 5 11 19" />
            <line x1="19" y1="5" x2="19" y2="19" />
          </svg>
        </button>
        <button
          onClick={() => onPlayheadChange(duration)}
          className="p-1.5 rounded hover:bg-muted"
          title="跳到结尾 (End)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="13 19 22 12 13 5 13 19" />
            <line x1="5" y1="5" x2="5" y2="19" />
          </svg>
        </button>
      </div>

      {/* 中间：时间码显示与输入 */}
      <div className="flex items-center gap-2">
        <form onSubmit={handleTimeSubmit} className="flex items-center gap-1">
          <label className="text-xs text-muted-foreground">时间:</label>
          <input
            type="text"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            onBlur={handleTimeSubmit}
            className="w-28 px-2 py-1 bg-muted border border-border rounded text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="00:00:00"
          />
        </form>

        <span className="text-xs text-muted-foreground px-2">/</span>

        <form onSubmit={handleDurationSubmit} className="flex items-center gap-1">
          <label className="text-xs text-muted-foreground">时长:</label>
          <input
            type="text"
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            onBlur={handleDurationSubmit}
            className="w-20 px-2 py-1 bg-muted border border-border rounded text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">秒</span>
        </form>

        <div className="w-px h-6 bg-muted mx-2" />

        {/* 帧率显示 */}
        <div className="px-2 py-1 bg-muted rounded text-xs text-muted-foreground font-mono">
          {fps} fps
        </div>
      </div>

      {/* 右侧：缩放/轨道/设置 */}
      <div className="flex items-center gap-2">
        {/* 缩放控制 */}
        <div className="flex items-center gap-1 bg-muted rounded px-2 py-1">
          <button
            onClick={() => setZoomLevel(Math.max(10, zoomLevel - 25))}
            className="p-1 rounded hover:bg-muted"
            title="缩小 (-)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.3-4.3" />
              <path d="M8 11h8" />
            </svg>
          </button>
          <input
            type="range"
            min="10"
            max="300"
            value={zoomLevel}
            onChange={(e) => setZoomLevel(Number(e.target.value))}
            className="w-32 h-2 accent-blue-500"
          />
          <span className="px-1 text-xs text-muted-foreground font-mono w-14 text-right">{zoomLevel}px/s</span>
          <button
            onClick={() => setZoomLevel(Math.min(300, zoomLevel + 25))}
            className="p-1 rounded hover:bg-muted"
            title="放大 (+)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.3-4.3" />
              <path d="M11 8v8" />
              <path d="M8 11h8" />
            </svg>
          </button>
          <button
            onClick={() => setZoomLevel(50)}
            className="ml-1 p-1 rounded hover:bg-muted text-xs text-muted-foreground hover:text-foreground"
            title="重置缩放"
          >
            100%
          </button>
        </div>

        <div className="w-px h-6 bg-muted mx-2" />

        {/* 添加轨道 */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">添加:</span>
          {([
            { type: "video", label: "视频", color: "#3b82f6" },
            { type: "audio", label: "音频", color: "#22c55e" },
            { type: "subtitle", label: "字幕", color: "#f59e0b" },
            { type: "effect", label: "特效", color: "#ec4899" },
            { type: "transition", label: "转场", color: "#6366f1" },
          ] satisfies Array<{ type: TrackType; label: string; color: string }>).map((t) => (
            <button
              key={t.type}
              onClick={() => onAddTrack(t.type)}
              className="p-1.5 rounded hover:bg-muted text-xs flex items-center gap-1"
              style={{ color: t.color }}
              title={`添加${t.label}轨道`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-muted mx-2" />

        {/* 帧率选择 */}
        <select
          value={fps}
          onChange={(e) => { /* fps 通常固定，这里仅显示 */ }}
          className="px-2 py-1 bg-muted border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value={24}>24 fps</option>
          <option value={25}>25 fps</option>
          <option value={30}>30 fps</option>
          <option value={60}>60 fps</option>
        </select>
      </div>
    </div>
  );
}