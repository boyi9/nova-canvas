import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { TimelineClip, TimelineTrack, ClipType, CLIP_TYPE_COLORS, formatTime, generateClipId } from "./timelineTypes";

interface TimelineTrackComponentProps {
  track: TimelineTrack;
  zoomLevel: number;
  playheadPosition: number;
  duration: number;
  selectedClipIds: string[];
  onClipSelect: (clipId: string, additive?: boolean) => void;
  onClipMove: (clipId: string, trackId: string, startTime: number) => void;
  onClipTrim: (clipId: string, trimStart: number, trimEnd: number) => void;
  onClipSplit: (clipId: string, time: number) => void;
  onClipDuplicate: (clipId: string) => void;
  onClipRemove: (clipId: string) => void;
}

export function TimelineTrackComponent({
  track,
  zoomLevel,
  playheadPosition,
  duration,
  selectedClipIds,
  onClipSelect,
  onClipMove,
  onClipTrim,
  onClipSplit,
  onClipDuplicate,
  onClipRemove,
}: TimelineTrackComponentProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [draggingClip, setDraggingClip] = useState<{ clipId: string; startX: number; startTime: number } | null>(null);
  const [trimmingClip, setTrimmingClip] = useState<{ clipId: string; edge: "start" | "end"; startX: number; originalTrim: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);

  const isSelected = (clipId: string) => selectedClipIds.includes(clipId);
  const clipColor = CLIP_TYPE_COLORS[track.type] || track.color;

  // 处理鼠标按下（拖拽移动）
  const handleMouseDown = (e: React.MouseEvent, clip: TimelineClip) => {
    if (track.locked) return;
    e.stopPropagation();
    e.preventDefault();
    setDraggingClip({ clipId: clip.id, startX: e.clientX, startTime: clip.startTime });
    if (!isSelected(clip.id)) {
      onClipSelect(clip.id, false);
    }
  };

  // 处理边缘拖拽（修剪）
  const handleTrimMouseDown = (e: React.MouseEvent, clip: TimelineClip, edge: "start" | "end") => {
    if (track.locked) return;
    e.stopPropagation();
    e.preventDefault();
    const trim = edge === "start" ? clip.trimStart : clip.trimEnd;
    setTrimmingClip({ clipId: clip.id, edge, startX: e.clientX, originalTrim: trim });
    onClipSelect(clip.id, false);
  };

  // 全局鼠标移动/释放
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingClip) {
        const dx = (e.clientX - draggingClip.startX) / zoomLevel;
        // 保持片段整体在轨道范围内：起点 >= 0，且 起点+片段时长 <= 总时长
        const dragging = track.clips.find((c) => c.id === draggingClip.clipId);
        const span = dragging ? Math.max(0, dragging.endTime - dragging.startTime) : 0;
        const maxStart = Math.max(0, duration - span);
        const newTime = Math.max(0, Math.min(maxStart, draggingClip.startTime + dx));
        onClipMove(draggingClip.clipId, track.id, newTime);
      }
      if (trimmingClip) {
        const dx = (e.clientX - trimmingClip.startX) / zoomLevel;
        const clip = track.clips.find(c => c.id === trimmingClip.clipId);
        if (!clip) return;
        if (trimmingClip.edge === "start") {
          const newTrimStart = Math.max(0, Math.min(clip.sourceDuration - (clip.trimEnd - clip.trimStart), trimmingClip.originalTrim + dx));
          onClipTrim(trimmingClip.clipId, newTrimStart, clip.trimEnd);
        } else {
          const newTrimEnd = Math.min(clip.sourceDuration, Math.max(clip.trimStart, trimmingClip.originalTrim + dx));
          onClipTrim(trimmingClip.clipId, clip.trimStart, newTrimEnd);
        }
      }
    };

    const handleMouseUp = () => {
      setDraggingClip(null);
      setTrimmingClip(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingClip, trimmingClip, zoomLevel, track.clips, track.id]);

  // 右键菜单
  const handleContextMenu = (e: React.MouseEvent, clip: TimelineClip) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, clipId: clip.id });
    onClipSelect(clip.id, false);
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  return (
    <div
      ref={trackRef}
      className="relative border-b border-border"
      style={{ height: track.height }}
    >
      {/* 轨道背景网格 */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(Math.ceil(duration / 10))].map((_, i) => (
          <div
            key={i}
            className="absolute w-px h-full bg-card/50"
            style={{ left: i * 10 * zoomLevel }}
          />
        ))}
      </div>

      {/* 片段 */}
      {track.clips.map((clip) => {
        const isSel = isSelected(clip.id);
        const clipWidth = Math.max(2, (clip.endTime - clip.startTime) * zoomLevel);
        const clipLeft = clip.startTime * zoomLevel;

        return (
          <div
            key={clip.id}
            className={cn(
              "absolute top-1 bottom-1 rounded cursor-pointer select-none transition-all",
              "hover:shadow-lg hover:z-10",
              isSel && "ring-2 ring-ring"
            )}
            style={{
              left: clipLeft,
              width: clipWidth,
              backgroundColor: clipColor + "CC",
              borderColor: isSel ? "#3b82f6" : "transparent",
              borderWidth: isSel ? 2 : 0,
              opacity: clip.opacity ?? 1,
            }}
            onMouseDown={(e) => handleMouseDown(e, clip)}
            onContextMenu={(e) => handleContextMenu(e, clip)}
            onDoubleClick={() => onClipSplit(clip.id, clip.startTime + (clip.endTime - clip.startTime) / 2)}
          >
            {/* 片段内容 */}
            <div className="w-full h-full flex flex-col overflow-hidden p-1">
              {/* 缩略图/波形 */}
              <div className="flex-1 relative overflow-hidden">
                {clip.type === "audio" && clip.waveform && clip.waveform.length > 0 && (
                  <canvas
                    className="w-full h-full"
                    width={clipWidth}
                    height={track.height - 2}
                    style={{ opacity: 0.7 }}
                  />
                )}
                {clip.thumbnail && (
                  <img
                    src={clip.thumbnail}
                    alt=""
                    className="w-full h-full object-cover opacity-70"
                  />
                )}
                {!clip.thumbnail && clip.type !== "audio" && (
                  <div className="w-full h-full flex items-center justify-center bg-black/20">
                    <span className="text-xs text-foreground/70 font-mono">{clip.id.slice(0, 6)}</span>
                  </div>
                )}
              </div>

              {/* 片段名称 */}
              <div className="flex items-center justify-between px-1 text-[10px] text-foreground truncate">
                <span className="font-medium truncate">{clip.name}</span>
                <span className="text-[9px] opacity-70 font-mono">
                  {formatTime(clip.endTime - clip.startTime)}
                </span>
              </div>
            </div>

            {/* 左边缘修剪手柄 */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary/50"
              onMouseDown={(e) => handleTrimMouseDown(e, clip, "start")}
            />

            {/* 右边缘修剪手柄 */}
            <div
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-primary/50"
              onMouseDown={(e) => handleTrimMouseDown(e, clip, "end")}
            />

            {/* 选中指示 */}
            {isSel && (
              <div className="absolute inset-0 border-2 border-blue-500 pointer-events-none rounded" />
            )}

            {/* 锁定/静音指示 */}
            {clip.locked && (
              <div className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center text-foreground/50">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
            )}
          </div>
        );
      })}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-card border border-border rounded-lg shadow-xl p-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button onClick={() => { onClipSplit(contextMenu.clipId, playheadPosition); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted rounded">分割</button>
          <button onClick={() => { onClipDuplicate(contextMenu.clipId); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted rounded">复制</button>
          <button onClick={() => { onClipRemove(contextMenu.clipId); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-muted rounded">删除</button>
          <hr className="my-1 border-border" />
          <button onClick={() => { setContextMenu(null); }} className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted rounded">取消</button>
        </div>
      )}
    </div>
  );
}