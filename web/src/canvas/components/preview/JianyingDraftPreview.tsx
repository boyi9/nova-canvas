import { useState, useMemo, useCallback } from "react";
import { ALargeSmall, ArrowRightLeft, Film, HelpCircle, Image, Music, Music2, Package, Palette, Play, Settings, Sparkles, Sticker, Type, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface JianyingDraft {
  metadata: {
    id: string;
    name: string;
    version: string;
    duration: number;        // 微秒
    width: number;
    height: number;
    fps: number;
    createTime: number;
    updateTime: number;
  };
  tracks: JianyingTrack[];
  materials: JianyingMaterial[];
  canvasConfig: {
    width: number;
    height: number;
    backgroundColor: string;
  };
}

export interface JianyingTrack {
  id: string;
  type: "video" | "audio" | "text" | "sticker" | "effect" | "filter" | "transition";
  name: string;
  attribute: number;          // 0=主轨道, 1=备用轨道
  flag: number;
  segments: JianyingSegment[];
}

export interface JianyingSegment {
  id: string;
  materialId: string;
  trackId: string;
  sourceTimerange: {
    start: number;      // 微秒
    duration: number;   // 微秒
  };
  targetTimerange: {
    start: number;      // 微秒
    duration: number;   // 微秒
  };
  visible: boolean;
  volume: number;
  speed: number;
  // 视频特有
  crop?: { x: number; y: number; width: number; height: number };
  transform?: { x: number; y: number; scaleX: number; scaleY: number; rotation: number };
  // 字幕特有
  text?: string;
  fontSize?: number;
  fontColor?: string;
  fontFamily?: string;
  alignment?: number;
  // 特效特有
  effectType?: string;
  effectParams?: Record<string, any>;
}

export interface JianyingMaterial {
  id: string;
  type: "video" | "audio" | "image" | "text" | "sticker" | "effect" | "font" | "music";
  name: string;
  path: string;
  duration: number;       // 微秒
  width?: number;
  height?: number;
  fps?: number;
  // 视频/音频特有
  hasAudio?: boolean;
  hasVideo?: boolean;
  // 图片特有
  width_px?: number;
  height_px?: number;
  // 文本特有
  textContent?: string;
  fontSize?: number;
  fontColor?: string;
  fontFamily?: string;
}

interface JianyingDraftPreviewProps {
  draft: JianyingDraft | null;
  onSegmentSelect: (segment: any, track: any) => void;
  onSegmentUpdate: (segmentId: string, updates: any) => void;
  onTrackSelect: (track: any) => void;
  onMaterialSelect: (material: any) => void;
  className?: string;
}

const TRACK_TYPE_CONFIG: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  video: { icon: Film, color: "text-primary", label: "视频" },
  audio: { icon: Music, color: "text-green-400", label: "音频" },
  text: { icon: Type, color: "text-amber-400", label: "字幕" },
  sticker: { icon: Sticker, color: "text-purple-400", label: "贴纸" },
  effect: { icon: Sparkles, color: "text-pink-400", label: "特效" },
  filter: { icon: Palette, color: "text-rose-400", label: "滤镜" },
  transition: { icon: ArrowRightLeft, color: "text-indigo-400", label: "转场" },
};

const MATERIAL_TYPE_CONFIG: Record<string, { icon: LucideIcon; color: string }> = {
  video: { icon: Film, color: "text-primary" },
  audio: { icon: Music, color: "text-green-400" },
  image: { icon: Image, color: "text-purple-400" },
  text: { icon: Type, color: "text-amber-400" },
  sticker: { icon: Sticker, color: "text-pink-400" },
  effect: { icon: Sparkles, color: "text-rose-400" },
  font: { icon: ALargeSmall, color: "text-indigo-400" },
  music: { icon: Music2, color: "text-emerald-400" },
};

function formatTime(us: number): string {
  const ms = us / 1000;
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const remainingSecs = secs % 60;
  const remainingMins = mins % 60;
  const remainingMs = Math.floor(ms % 1000);
  if (hours > 0) return `${hours}:${remainingMins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}.${remainingMs.toString().padStart(3, "0")}`;
  return `${remainingMins}:${remainingSecs.toString().padStart(2, "0")}.${remainingMs.toString().padStart(3, "0")}`;
}

function usToPx(us: number, zoom: number): number {
  return (us / 1000000) * zoom;
}

interface TrackRowProps {
  track: any;
  draft: any;
  zoom: number;
  selectedSegmentId: string | null;
  onSegmentSelect: (segment: any, track: any) => void;
  onSegmentUpdate: (segmentId: string, updates: any) => void;
}

function TrackRow({ track, draft, zoom, selectedSegmentId, onSegmentSelect, onSegmentUpdate }: TrackRowProps) {
  const config = TRACK_TYPE_CONFIG[track.type] || { icon: HelpCircle, color: "text-muted-foreground", label: track.type };
  const trackDuration = draft.metadata.duration;
  const trackWidth = usToPx(trackDuration, zoom);

  return (
    <div className="border-b border-border">
      {/* 轨道头部 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-card border-b border-border w-48 flex-shrink-0">
        <config.icon className="size-4" />
        <span className="text-sm font-medium text-foreground">{track.name}</span>
        <span className="text-xs text-muted-foreground ml-auto">{config.label}</span>
      </div>

      {/* 轨道内容 */}
      <div className="relative h-32 overflow-hidden bg-background" style={{ width: trackWidth }}>
        {/* 时间网格 */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(Math.ceil(trackDuration / 10000000))].map((_, i) => (
            <div
              key={i}
              className="absolute w-px h-full bg-card/50"
              style={{ left: i * usToPx(10000000, zoom) }}
            />
          ))}
        </div>

        {/* 片段 */}
        <div className="absolute inset-0">
          {track.segments.map((segment: any) => {
            const material = draft.materials.find((m: any) => m.id === segment.materialId);
            const startX = usToPx(segment.targetTimerange.start, zoom);
            const width = Math.max(2, usToPx(segment.targetTimerange.duration, zoom));
            const isSelected = selectedSegmentId === segment.id;

            return (
              <div
                key={segment.id}
                className={cn(
                  "absolute top-1 bottom-1 rounded cursor-pointer select-none transition-all",
                  "hover:shadow-lg hover:z-10",
                  isSelected && "ring-2 ring-ring"
                )}
                style={{
                  left: startX,
                  width: Math.max(2, width - 2),
                  backgroundColor: TRACK_TYPE_CONFIG[track.type]?.color?.replace("text-", "bg-").replace("-400", "-500/50") || "bg-primary/15",
                  borderColor: isSelected ? "#3b82f6" : "transparent",
                  borderWidth: isSelected ? 2 : 0,
                }}
                onClick={() => onSegmentSelect(segment, track)}
              >
                <div className="w-full h-full flex flex-col overflow-hidden p-1">
                  <div className="flex-1 relative overflow-hidden">
                    {material?.type === "video" && (
                      <div className="w-full h-full bg-gradient-to-r from-blue-500/30 to-blue-600/30 flex items-center justify-center">
                        <Play className="size-3" />
                      </div>
                    )}
                    {material?.type === "audio" && (
                      <div className="w-full h-full bg-gradient-to-r from-green-500/30 to-green-600/30 flex items-center justify-center">
                        <Music className="size-3" />
                      </div>
                    )}
                    {material?.type === "image" && (
                      <div className="w-full h-full bg-gradient-to-r from-purple-500/30 to-purple-600/30 flex items-center justify-center">
                        <Image className="size-3" />
                      </div>
                    )}
                    {material?.type === "text" && (
                      <div className="w-full h-full bg-gradient-to-r from-amber-500/30 to-amber-600/30 flex items-center justify-center">
                        <Type className="size-3" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-1 text-[10px] text-foreground truncate">
                    <span className="font-medium truncate">{material?.name || segment.id.slice(0, 8)}</span>
                    <span className="text-[9px] opacity-70 font-mono">
                      {formatTime(segment.targetTimerange.duration)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 播放头指示 */}
        {/* 这里可以添加播放头指示器 */}
      </div>
    </div>
  );
}

export function JianyingDraftPreview({
  draft,
  onSegmentSelect,
  onSegmentUpdate,
  onTrackSelect,
  onMaterialSelect,
  className,
}: JianyingDraftPreviewProps) {
  if (!draft) {
    return (
      <div className={cn("flex flex-col h-full bg-background", className)}>
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4">
            <rect x="2" y="2" width="20" height="20" rx="2" />
            <path d="M8 12l4 4 6-6" />
          </svg>
          <p className="text-lg font-medium text-muted-foreground">暂无剪映草稿</p>
          <p className="text-sm text-muted-foreground mt-1">导入或创建草稿开始预览</p>
        </div>
      </div>
    );
  }

  const [zoom, setZoom] = useState(200); // px per second
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<any>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"timeline" | "materials" | "properties">("timeline");
  const [sidebarWidth, setSidebarWidth] = useState(320);

  const handleSegmentSelect = useCallback((segment: any, track: any) => {
    setSelectedSegmentId(segment.id);
    setSelectedTrack(track);
    const material = draft.materials.find((m: any) => m.id === segment.materialId);
    if (material) setSelectedMaterial(material);
    onSegmentSelect?.(segment, track);
  }, [draft]);

  const totalDuration = draft.metadata.duration;
  const totalWidth = (totalDuration / 1000000) * zoom;

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
            <span className="text-foreground text-sm font-bold">剪映</span>
          </div>
          <div>
            <p className="font-medium text-foreground">{draft.metadata.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatTime(draft.metadata.duration)} · {draft.metadata.width}×{draft.metadata.height} · {draft.metadata.fps}fps
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 缩放控制 */}
          <div className="flex items-center gap-2 px-2 py-1 bg-muted rounded">
            <button onClick={() => setZoom(Math.max(50, zoom - 50))} className="p-1 rounded hover:bg-muted" title="缩小"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h8"/></svg></button>
            <input type="range" min="50" max="500" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-32 h-2 accent-red-500" />
            <span className="px-2 text-xs text-muted-foreground font-mono w-16 text-right">{zoom}px/s</span>
            <button onClick={() => setZoom(Math.min(500, zoom + 50))} className="p-1 rounded hover:bg-muted" title="放大"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v8"/><path d="M8 11h8"/></svg></button>
          </div>

          <div className="w-px h-6 bg-muted mx-2" />

          {/* 标签页 */}
          <div className="flex border-b border-border">
            {([
              { id: "timeline", label: "时间线", icon: Film },
              { id: "materials", label: "素材库", icon: Package },
              { id: "properties", label: "属性", icon: Settings },
            ] as const).map((tab) => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                    activeTab === tab.id ? "border-red-500 text-red-400" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <TabIcon className="size-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：轨道列表 */}
        <div className="w-48 flex-shrink-0 bg-card border-r border-border overflow-y-auto">
          <div className="p-2 border-b border-border flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">轨道</span>
            <button className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="添加轨道">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
          {draft.tracks.map((track) => (
            <div key={track.id} className="px-3 py-2 border-b border-border flex items-center gap-2 hover:bg-muted/50 cursor-pointer"
              onClick={() => onTrackSelect?.(track)}>
              <span className="text-base">{(() => { const Icon = TRACK_TYPE_CONFIG[track.type]?.icon || HelpCircle; return <Icon className="size-4" />; })()}</span>
              <span className="text-sm text-foreground truncate flex-1">{track.name}</span>
              <span className="text-xs text-muted-foreground">{TRACK_TYPE_CONFIG[track.type]?.label || track.type}</span>
            </div>
          ))}
        </div>

        {/* 中间：时间轴 */}
        <div className="flex-1 relative overflow-auto bg-background">
          {/* 标尺 */}
          <div className="h-10 bg-card border-b border-border sticky top-0 z-10 flex items-end px-48" style={{ width: totalWidth }}>
            <div className="flex" style={{ width: totalWidth }}>
              {Array.from({ length: Math.ceil(draft.metadata.duration / 10000000) + 1 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center w-[1000px]" style={{ minWidth: "100px" }}>
                  <div className="w-px h-6 bg-gray-500" />
                  <span className="text-[10px] text-muted-foreground font-mono mt-1 whitespace-nowrap">
                    {formatTime(i * 10000000)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 轨道区域 */}
          <div className="relative" style={{ width: totalWidth }}>
            {draft.tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                draft={draft}
                zoom={zoom}
                selectedSegmentId={selectedSegmentId}
                onSegmentSelect={setSelectedSegmentId}
                onSegmentUpdate={onSegmentUpdate}
              />
            ))}
          </div>
        </div>

        {/* 右侧侧边栏 */}
        <div className="w-80 flex-shrink-0 bg-card border-l border-border flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h3 className="font-medium text-foreground">属性 / 素材</h3>
            <button onClick={() => setActiveTab("properties")} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {selectedTrack && (
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">轨道属性</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">类型</span><span className="text-foreground">{TRACK_TYPE_CONFIG[selectedTrack.type]?.label || selectedTrack.type}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">片段数</span><span className="text-foreground">{selectedTrack.segments?.length || 0}</span></div>
                </div>
              </div>
            )}

            {selectedSegmentId && draft.materials.find((m: any) => {
              const seg = selectedTrack?.segments?.find((s: any) => s.id === selectedSegmentId);
              return seg && m.id === seg.materialId;
            }) && (
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">片段属性</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">素材</span><span className="text-foreground truncate max-w-[200px]">{selectedMaterial?.name}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">时长</span><span className="text-foreground font-mono">{formatTime(selectedTrack.segments?.find((s: JianyingSegment) => s.id === selectedSegmentId)?.targetTimerange?.duration || 0)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">音量</span><span className="text-foreground">100%</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">速度</span><span className="text-foreground">1.0x</span></div>
                </div>
              </div>
            )}

            {selectedMaterial && (
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">素材信息</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">名称</span><span className="text-foreground truncate max-w-[200px]">{selectedMaterial.name}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">类型</span><span className="text-foreground">{selectedMaterial.type}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">时长</span><span className="text-foreground font-mono">{formatTime(selectedMaterial.duration)}</span></div>
                  {selectedMaterial.width && selectedMaterial.height && (
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">分辨率</span><span className="text-foreground">{selectedMaterial.width}×{selectedMaterial.height}</span></div>
                  )}
                </div>
              </div>
            )}

            {!selectedTrack && !selectedSegmentId && !selectedMaterial && (
              <div className="text-center text-muted-foreground py-12">
                <p className="text-sm">选择轨道、片段或素材查看属性</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { formatTime, usToPx };