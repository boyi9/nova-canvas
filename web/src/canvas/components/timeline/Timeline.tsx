import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Circle, Eye, EyeOff, Lock, Trash2, Unlock, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TimelineTrack,
  TimelineClip,
  TimelineState,
  TimelineSnapshot,
  TrackType,
  ClipType,
  DEFAULT_TRACK_CONFIG,
  CLIP_TYPE_COLORS,
  formatTime,
  generateClipId,
  generateTrackId,
  parseTime,
} from "./timelineTypes";
import { generateWaveformFromUrl, normalizeTransition } from "./timeline-animation";
import { TimelineRuler } from "./TimelineRuler";
import { TimelineTrackComponent } from "./TimelineTrackComponent";
import { TimelinePlayhead } from "./TimelinePlayhead";
import { TimelineToolbar } from "./TimelineToolbar";
import { ClipPropertiesPanel } from "./ClipPropertiesPanel";

interface TimelineProps {
  initialState?: Partial<TimelineState>;
  onStateChange?: (state: TimelineState) => void;
  onPlayheadChange?: (time: number) => void;
  className?: string;
  height?: number;
}

export function Timeline({
  initialState,
  onStateChange,
  onPlayheadChange,
  className,
  height = 600,
}: TimelineProps) {
  // 状态管理
  const [tracks, setTracks] = useState<TimelineTrack[]>(() => {
    if (initialState?.tracks?.length) return initialState.tracks;
    // 默认创建 5 个轨道
    return Object.entries(DEFAULT_TRACK_CONFIG).map(([type, config], i) => ({
      id: generateTrackId(),
      type: type as TrackType,
      name: config.name,
      color: config.color,
      height: config.height,
      visible: true,
      locked: false,
      muted: false,
      solo: false,
      clips: [],
      order: i,
    }));
  });

  const [duration, setDuration] = useState(initialState?.duration || 60); // 默认 60 秒
  const [fps] = useState(30);
  const [playheadPosition, setPlayheadPosition] = useState(initialState?.playheadPosition || 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(initialState?.zoomLevel || 50); // px per second
  const [scrollX, setScrollX] = useState(0);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [showProperties, setShowProperties] = useState(false);

  // 历史记录用于撤销/重做
  const [history, setHistory] = useState<TimelineSnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  // 保存历史
  const saveHistory = useCallback(() => {
    const state: TimelineSnapshot = {
      tracks: JSON.parse(JSON.stringify(tracks)),
      duration,
      fps,
      playheadPosition,
      isPlaying,
      zoomLevel,
      scrollX,
      selectedClipIds: [...selectedClipIds],
    };
    setHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      next.push(state);
      return next.slice(-50); // 保留最近 50 步
    });
    setHistoryIndex((i) => Math.min(i + 1, 49));
  }, [tracks, duration, playheadPosition, isPlaying, zoomLevel, scrollX, selectedClipIds, historyIndex]);

  // 撤销/重做
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setTracks(prevState.tracks);
      setDuration(prevState.duration);
      setPlayheadPosition(prevState.playheadPosition);
      setIsPlaying(prevState.isPlaying);
      setZoomLevel(prevState.zoomLevel);
      setScrollX(prevState.scrollX);
      setSelectedClipIds(prevState.selectedClipIds);
      setHistoryIndex((i) => i - 1);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setTracks(nextState.tracks);
      setDuration(nextState.duration);
      setPlayheadPosition(nextState.playheadPosition);
      setIsPlaying(nextState.isPlaying);
      setZoomLevel(nextState.zoomLevel);
      setScrollX(nextState.scrollX);
      setSelectedClipIds(nextState.selectedClipIds);
      setHistoryIndex((i) => i + 1);
    }
  }, [history, historyIndex]);

  // 通知状态变化
  useEffect(() => {
    onStateChange?.({
      tracks,
      duration,
      fps,
      resolution: initialState?.resolution ?? { width: 1920, height: 1080 },
      playheadPosition,
      isPlaying,
      zoomLevel,
      scrollX,
      selectedClipIds,
      clipboard: [],
    });
  }, [tracks, duration, playheadPosition, isPlaying, zoomLevel, scrollX, selectedClipIds, onStateChange, initialState?.resolution]);

  // 播放逻辑
  useEffect(() => {
    if (!isPlaying) return;
    let rafId: number;
    const animate = (timestamp: number) => {
      setPlayheadPosition((prev) => {
        const next = prev + 1 / 60; // 假设 60fps 更新
        if (next >= duration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, duration]);

  // 同步播放头位置
  useEffect(() => {
    onPlayheadChange?.(playheadPosition);
  }, [playheadPosition, onPlayheadChange]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
      if (e.key === " ") {
        e.preventDefault();
        setIsPlaying((p) => !p);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPlayheadPosition((p) => Math.max(0, p - 1 / fps));
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setPlayheadPosition((p) => Math.min(duration, p + 1 / fps));
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedClipIds.length > 0) {
          e.preventDefault();
          selectedClipIds.forEach((id) => removeClip(id));
        }
      }
      if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        // 保存逻辑
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fps, duration, selectedClipIds, historyIndex, history]);

  // ===== 操作方法 =====

  const addTrack = (type: TrackType, name?: string) => {
    saveHistory();
    const config = DEFAULT_TRACK_CONFIG[type];
    setTracks((prev) => [
      ...prev,
      {
        id: generateTrackId(),
        type,
        name: name || config.name,
        color: config.color,
        height: config.height,
        visible: true,
        locked: false,
        muted: false,
        solo: false,
        clips: [],
        order: prev.length,
      },
    ]);
  };

  const removeTrack = (trackId: string) => {
    if (tracks.length <= 1) return;
    saveHistory();
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
  };

  const toggleTrackVisibility = (trackId: string) => {
    saveHistory();
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, visible: !t.visible } : t)));
  };

  const toggleTrackLock = (trackId: string) => {
    saveHistory();
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, locked: !t.locked } : t)));
  };

  const toggleTrackMute = (trackId: string) => {
    saveHistory();
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)));
  };

  const toggleTrackSolo = (trackId: string) => {
    saveHistory();
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, solo: !t.solo } : t)));
  };

  const addClip = (trackId: string, clip: Omit<TimelineClip, "id">) => {
    saveHistory();
    let nextClip: TimelineClip = { ...clip, id: generateClipId() };
    // 转场片段：补齐默认时长并按片段长度收敛
    if (nextClip.type === "transition") {
      nextClip = normalizeTransition(nextClip);
    }
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, nextClip] } : t))
    );
    setSelectedClipIds([nextClip.id]);
    // 音频片段：异步生成波形峰值（失败保持空，由渲染层跳过）
    if (nextClip.type === "audio" && nextClip.sourceUrl && !nextClip.waveform?.length) {
      void generateWaveformFromUrl(nextClip.sourceUrl).then((waveform) => {
        if (!waveform.some((v) => v > 0)) return; // 无有效数据则不写入
        setTracks((prev) =>
          prev.map((t) => ({
            ...t,
            clips: t.clips.map((c) => (c.id === nextClip.id ? { ...c, waveform } : c)),
          }))
        );
      });
    }
    return nextClip.id;
  };

  const removeClip = (clipId: string) => {
    saveHistory();
    setTracks((prev) =>
      prev.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) }))
    );
    setSelectedClipIds((prev) => prev.filter((id) => id !== clipId));
  };

  const moveClip = (clipId: string, trackId: string, startTime: number) => {
    saveHistory();
    let movedClip: TimelineClip | null = null;
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id === trackId) {
          const clip = t.clips.find((c) => c.id === clipId);
          if (clip) {
            movedClip = clip;
            return { ...t, clips: [...t.clips, { ...clip, startTime, endTime: startTime + (clip.endTime - clip.startTime) }] };
          }
        }
        return t.id === trackId || t.clips.some((c) => c.id === clipId)
          ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
          : t;
      })
    );
  };

  const trimClip = (clipId: string, trimStart: number, trimEnd: number) => {
    saveHistory();
    setTracks((prev) =>
      prev.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId ? { ...c, trimStart, trimEnd, endTime: c.startTime + (trimEnd - trimStart) } : c
        ),
      }))
    );
  };

  const splitClip = (clipId: string, splitTime: number) => {
    saveHistory();
    let newIds: string[] = [];
    setTracks((prev) =>
      prev.map((t) => {
        const clipIndex = t.clips.findIndex((c) => c.id === clipId);
        if (clipIndex === -1) return t;
        const clip = t.clips[clipIndex];
        if (splitTime <= clip.startTime || splitTime >= clip.endTime) return t;

        const leftClip: TimelineClip = {
          ...clip,
          id: generateClipId(),
          endTime: splitTime,
          trimEnd: clip.trimStart + (splitTime - clip.startTime),
        };
        const rightClip: TimelineClip = {
          ...clip,
          id: generateClipId(),
          startTime: splitTime,
          trimStart: clip.trimStart + (splitTime - clip.startTime),
        };
        newIds = [leftClip.id, rightClip.id];
        const newClips = [...t.clips];
        newClips.splice(clipIndex, 1, leftClip, rightClip);
        return { ...t, clips: newClips };
      })
    );
    return newIds;
  };

  const duplicateClip = (clipId: string) => {
    saveHistory();
    let newId: string | null = null;
    setTracks((prev) =>
      prev.map((t) => {
        const clip = t.clips.find((c) => c.id === clipId);
        if (!clip) return t;
        const newClip: TimelineClip = {
          ...clip,
          id: generateClipId(),
          startTime: clip.endTime,
          endTime: clip.endTime + (clip.endTime - clip.startTime),
        };
        newId = newClip.id;
        return { ...t, clips: [...t.clips, newClip] };
      })
    );
    return newId;
  };

  const selectClip = (clipId: string, additive = false) => {
    setSelectedClipIds((prev) => (additive ? [...prev, clipId] : prev.includes(clipId) ? [] : [clipId]));
  };

  const clearSelection = () => setSelectedClipIds([]);

  const copyClips = (clipIds: string[]) => {
    const clips: TimelineClip[] = [];
    tracks.forEach((t) => {
      t.clips.forEach((c) => {
        if (clipIds.includes(c.id)) clips.push(c);
      });
    });
    navigator.clipboard.writeText(JSON.stringify(clips));
  };

  const pasteClips = (trackId: string, time: number) => {
    navigator.clipboard.readText().then((text) => {
      try {
        const clips: TimelineClip[] = JSON.parse(text);
        saveHistory();
        clips.forEach((clip, i) => {
          const newClip: TimelineClip = {
            ...clip,
            id: generateClipId(),
            startTime: time + i * (clip.endTime - clip.startTime),
            endTime: time + (i + 1) * (clip.endTime - clip.startTime),
          };
          setTracks((prev) =>
            prev.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t))
          );
        });
      } catch (e) {
        console.error("粘贴失败:", e);
      }
    });
  };

  // 查找片段
  const findClip = (clipId: string): { track: TimelineTrack; clip: TimelineClip } | null => {
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return { track, clip };
    }
    return null;
  };

  // 选中的片段
  const selectedClips = useMemo(
    () => tracks.flatMap((t) => t.clips.filter((c) => selectedClipIds.includes(c.id))),
    [tracks, selectedClipIds]
  );

  // 容器尺寸
  const containerWidth = containerRef.current?.clientWidth || 1200;
  const visibleDuration = containerWidth / zoomLevel;

  return (
    <div className={cn("flex flex-col h-full bg-background", className)} style={{ height }}>
      {/* 工具栏 */}
      <TimelineToolbar
        duration={duration}
        fps={fps}
        playheadPosition={playheadPosition}
        isPlaying={isPlaying}
        zoomLevel={zoomLevel}
        setZoomLevel={setZoomLevel}
        setDuration={setDuration}
        onPlayToggle={() => setIsPlaying(!isPlaying)}
        onPlayheadChange={setPlayheadPosition}
        onUndo={undo}
        onRedo={redo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onAddTrack={addTrack}
      />

      {/* 主时间轴区域 */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 左侧轨道标题 */}
        <div
          className="w-40 flex-shrink-0 bg-card border-r border-border overflow-y-auto"
          ref={rulerRef}
        >
          <div className="h-10 border-b border-border px-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>轨道</span>
            <button onClick={() => addTrack("video")} className="p-1 hover:bg-muted rounded text-muted-foreground" title="添加轨道">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
          {tracks.map((track) => (
            <TimelineTrackHeader
              key={track.id}
              track={track}
              onVisibilityToggle={toggleTrackVisibility}
              onLockToggle={toggleTrackLock}
              onMuteToggle={toggleTrackMute}
              onSoloToggle={toggleTrackSolo}
              onRemove={removeTrack}
              onAddClip={(clip) => addClip(track.id, clip)}
            />
          ))}
        </div>

        {/* 右侧时间轴内容 */}
        <div className="flex-1 relative overflow-auto" ref={tracksContainerRef} onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}>
          {/* 标尺 */}
          <TimelineRuler
            ref={rulerRef}
            duration={duration}
            zoomLevel={zoomLevel}
            scrollX={scrollX}
            fps={fps}
            playheadPosition={playheadPosition}
          />

          {/* 轨道内容 */}
          <div className="absolute top-10 left-0 right-0 bottom-0" style={{ transform: `translateX(-${scrollX}px)` }}>
            {tracks
              .filter((t) => t.visible)
              .map((track) => (
                <TimelineTrackComponent
                  key={track.id}
                  track={track}
                  zoomLevel={zoomLevel}
                  playheadPosition={playheadPosition}
                  duration={duration}
                  selectedClipIds={selectedClipIds}
                  onClipSelect={selectClip}
                  onClipMove={(id, trackId, time) => moveClip(id, trackId, time)}
                  onClipTrim={(id, trimStart, trimEnd) => trimClip(id, trimStart, trimEnd)}
                  onClipSplit={(id, time) => splitClip(id, time)}
                  onClipDuplicate={(id) => duplicateClip(id)}
                  onClipRemove={removeClip}
                />
              ))}
          </div>

          {/* 播放头 */}
          <TimelinePlayhead
            ref={playheadRef}
            position={playheadPosition}
            zoomLevel={zoomLevel}
            scrollX={scrollX}
            duration={duration}
            height={height - 100}
          />
        </div>
      </div>

      {/* 右侧属性面板 */}
      {showProperties && selectedClips.length > 0 && (
        <ClipPropertiesPanel
          clips={selectedClips}
          onClose={() => setShowProperties(false)}
          onUpdate={(clipId, updates) => {
            saveHistory();
            setTracks((prev) =>
              prev.map((t) => ({
                ...t,
                clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...updates } : c)),
              }))
            );
          }}
        />
      )}
    </div>
  );
}

// ===== 轨道头部组件 =====
interface TimelineTrackHeaderProps {
  track: TimelineTrack;
  onVisibilityToggle: (id: string) => void;
  onLockToggle: (id: string) => void;
  onMuteToggle: (id: string) => void;
  onSoloToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onAddClip: (clip: Omit<TimelineClip, "id">) => void;
}

function TimelineTrackHeader({
  track,
  onVisibilityToggle,
  onLockToggle,
  onMuteToggle,
  onSoloToggle,
  onRemove,
  onAddClip,
}: TimelineTrackHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className={cn(
        "h-20 flex items-center gap-2 px-2 border-b border-border relative group",
        track.locked && "opacity-50",
        track.muted && "opacity-70",
        track.solo && "ring-2 ring-yellow-500"
      )}
      style={{ height: track.height, backgroundColor: track.solo ? "rgba(234, 179, 8, 0.1)" : "transparent" }}
    >
      {/* 图标/颜色指示 */}
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: track.color }}
      />

      {/* 轨道名 */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <input
          type="text"
          defaultValue={track.name}
          className="bg-transparent border-none text-sm text-foreground focus:outline-none focus:bg-muted rounded px-1 w-20"
          disabled={track.locked}
        />
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{track.type}</span>
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onVisibilityToggle(track.id)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title={track.visible ? "隐藏" : "显示"}
        >
          {track.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>
        <button
          onClick={() => onLockToggle(track.id)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title={track.locked ? "解锁" : "锁定"}
        >
          {track.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
        </button>
        <button
          onClick={() => onMuteToggle(track.id)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title={track.muted ? "取消静音" : "静音"}
        >
          {track.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        </button>
        <button
          onClick={() => onSoloToggle(track.id)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-warning"
          title={track.solo ? "取消独奏" : "独奏"}
        >
          <Circle className="size-3.5" />
        </button>
        <button
          onClick={() => onRemove(track.id)}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          title="删除轨道"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}