import { useState, useCallback } from "react";
import { CloudUpload, FileText, Film, Image, Layers, PenTool, Scissors, Upload, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ExportFormat = "png" | "jpg" | "webp" | "svg" | "pdf" | "psd" | "mp4" | "mov" | "jianying" | "jianying_cloud";

export interface ExportPreset {
  id: string;
  name: string;
  category: string;
  format: ExportFormat;
  width?: number;
  height?: number;
  fps?: number;
  quality?: number;
  scale?: number;
}

export interface ExportJob {
  id: string;
  fileName: string;
  format: ExportFormat;
  progress: number; // 0-100
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
  resultUrl?: string;
  fileSize?: number;
  createdAt: number;
}

interface ExportPanelProps {
  onExport: (format: ExportFormat, options: Record<string, any>) => Promise<void>;
  jobs: ExportJob[];
  className?: string;
}

const EXPORT_PRESETS: ExportPreset[] = [
  { id: "png-1x", name: "PNG 1x", category: "图片", format: "png", scale: 1 },
  { id: "png-2x", name: "PNG 2x", category: "图片", format: "png", scale: 2 },
  { id: "jpg-quality", name: "JPG (高质量)", category: "图片", format: "jpg", quality: 95 },
  { id: "webp-opt", name: "WebP (优化)", category: "图片", format: "webp", quality: 85 },
  { id: "svg-vector", name: "SVG (矢量)", category: "矢量", format: "svg" },
  { id: "pdf-print", name: "PDF (印刷)", category: "文档", format: "pdf" },
  { id: "psd-layers", name: "PSD (保留图层)", category: "源文件", format: "psd" },
  { id: "mp4-1080p", name: "MP4 1080p", category: "视频", format: "mp4", width: 1920, height: 1080, fps: 30 },
  { id: "mp4-720p", name: "MP4 720p", category: "视频", format: "mp4", width: 1280, height: 720, fps: 30 },
  { id: "mov-prores", name: "MOV (ProRes)", category: "视频", format: "mov", width: 1920, height: 1080, fps: 30 },
  { id: "jianying-draft", name: "剪映草稿 (本地)", category: "剪映", format: "jianying" },
  { id: "jianying-cloud", name: "剪映草稿 (云端同步)", category: "剪映", format: "jianying_cloud" },
];

const FORMAT_CONFIG: Record<ExportFormat, { icon: LucideIcon; color: string; label: string }> = {
  png: { icon: Image, color: "bg-primary/10 text-primary border-blue-500/30", label: "PNG" },
  jpg: { icon: Image, color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", label: "JPG" },
  webp: { icon: Image, color: "bg-green-500/10 text-green-400 border-green-500/30", label: "WebP" },
  svg: { icon: PenTool, color: "bg-purple-500/10 text-purple-400 border-purple-500/30", label: "SVG" },
  pdf: { icon: FileText, color: "bg-red-500/10 text-red-400 border-red-500/30", label: "PDF" },
  psd: { icon: Layers, color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30", label: "PSD" },
  mp4: { icon: Film, color: "bg-pink-500/10 text-pink-400 border-pink-500/30", label: "MP4" },
  mov: { icon: Film, color: "bg-orange-500/10 text-orange-400 border-orange-500/30", label: "MOV" },
  jianying: { icon: Scissors, color: "bg-red-500/10 text-red-400 border-red-500/30", label: "剪映" },
  jianying_cloud: { icon: CloudUpload, color: "bg-sky-500/10 text-sky-400 border-sky-500/30", label: "剪映云" },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function ExportPanel({ onExport, jobs, className }: ExportPanelProps) {
  const [selectedPreset, setSelectedPreset] = useState<ExportPreset | null>(null);
  const [customFormat, setCustomFormat] = useState<ExportFormat>("png");
  const [fileName, setFileName] = useState("novacanvas-export");
  const [options, setOptions] = useState({ scale: 1, quality: 90, width: 1920, height: 1080, fps: 30, includeLayers: true, embedColorProfile: true });
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<"presets" | "custom" | "jobs">("presets");

  const handlePresetExport = useCallback(async (preset: ExportPreset) => {
    setIsExporting(true);
    try {
      await onExport(preset.format, {
        ...options,
        ...(preset.scale ? { scale: preset.scale } : {}),
        ...(preset.quality ? { quality: preset.quality } : {}),
        ...(preset.width ? { width: preset.width } : {}),
        ...(preset.height ? { height: preset.height } : {}),
        ...(preset.fps ? { fps: preset.fps } : {}),
        fileName,
      });
    } finally {
      setIsExporting(false);
    }
  }, [onExport, options, fileName]);

  const handleCustomExport = useCallback(async () => {
    setIsExporting(true);
    try {
      await onExport(customFormat, { ...options, fileName });
    } finally {
      setIsExporting(false);
    }
  }, [onExport, customFormat, options, fileName]);

  const groupedPresets = EXPORT_PRESETS.reduce((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {} as Record<string, ExportPreset[]>);

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* 顶部 */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <span className="text-lg"><Upload className="size-5" /></span>
          <span className="font-medium text-foreground">导出</span>
        </div>
        <div className="flex border-b border-border -mb-3">
          {(["presets", "custom", "jobs"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab ? "border-blue-500 text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "presets" && "预设"}
              {tab === "custom" && "自定义"}
              {tab === "jobs" && `任务 (${jobs.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* 预设标签 */}
        {activeTab === "presets" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">文件名</label>
              <input type="text" value={fileName} onChange={(e) => setFileName(e.target.value)} className="w-full px-3 py-2 text-sm bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="输入导出文件名" />
            </div>

            {Object.entries(groupedPresets).map(([category, presets]) => (
              <div key={category}>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{category}</h4>
                <div className="grid grid-cols-2 gap-2">
                  {presets.map((preset) => {
                    const fmt = FORMAT_CONFIG[preset.format];
                    return (
                      <button
                        key={preset.id}
                        onClick={() => handlePresetExport(preset)}
                        disabled={isExporting}
                        className={cn(
                          "flex items-center gap-2 p-3 rounded-lg border text-left transition-all",
                          "bg-card hover:bg-muted hover:border-border",
                          selectedPreset?.id === preset.id && "border-blue-500 ring-1 ring-ring",
                          isExporting && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <fmt.icon className="size-5" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{preset.name}</p>
                          <p className="text-xs text-muted-foreground">{fmt.label}{preset.width ? ` ${preset.width}×${preset.height}` : ""}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 自定义标签 */}
        {activeTab === "custom" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">文件名</label>
              <input type="text" value={fileName} onChange={(e) => setFileName(e.target.value)} className="w-full px-3 py-2 text-sm bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">格式</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(FORMAT_CONFIG).map(([format, cfg]) => (
                  <button
                    key={format}
                    onClick={() => setCustomFormat(format as ExportFormat)}
                    className={cn(
                      "flex flex-col items-center gap-1 p-3 rounded-lg border transition-all",
                      customFormat === format ? "border-blue-500 bg-primary/10 ring-1 ring-ring" : "bg-card border-border hover:border-gray-500"
                    )}
                  >
                    <span className="text-xl">
                      {(() => {
                        const FmtIcon = cfg.icon;
                        return <FmtIcon className="size-5" />;
                      })()}
                    </span>
                    <span className="text-xs text-foreground">{cfg.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 根据格式显示选项 */}
            {["png", "jpg", "webp"].includes(customFormat) && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">缩放倍数: {options.scale}x</label>
                  <input type="range" min="1" max="4" step="0.5" value={options.scale} onChange={(e) => setOptions({ ...options, scale: Number(e.target.value) })} className="w-full accent-blue-500" />
                </div>
                {customFormat !== "png" && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">质量: {options.quality}%</label>
                    <input type="range" min="10" max="100" value={options.quality} onChange={(e) => setOptions({ ...options, quality: Number(e.target.value) })} className="w-full accent-blue-500" />
                  </div>
                )}
              </div>
            )}

            {["mp4", "mov"].includes(customFormat) && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">宽度</label>
                    <input type="number" value={options.width} onChange={(e) => setOptions({ ...options, width: Number(e.target.value) })} className="w-full px-2 py-1.5 text-sm bg-card border border-border rounded text-foreground" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">高度</label>
                    <input type="number" value={options.height} onChange={(e) => setOptions({ ...options, height: Number(e.target.value) })} className="w-full px-2 py-1.5 text-sm bg-card border border-border rounded text-foreground" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">帧率: {options.fps}fps</label>
                  <input type="range" min="24" max="60" step="1" value={options.fps} onChange={(e) => setOptions({ ...options, fps: Number(e.target.value) })} className="w-full accent-blue-500" />
                </div>
              </div>
            )}

            {customFormat === "psd" && (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={options.includeLayers} onChange={(e) => setOptions({ ...options, includeLayers: e.target.checked })} className="accent-blue-500" />
                保留图层结构
              </label>
            )}

            <button
              onClick={handleCustomExport}
              disabled={isExporting}
              className={cn(
                "w-full py-3 rounded-lg font-medium transition-colors",
                isExporting ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-primary hover:bg-primary/90 text-primary-foreground"
              )}
            >
              {isExporting ? "导出中..." : `导出 ${FORMAT_CONFIG[customFormat].label}`}
            </button>
          </div>
        )}

        {/* 导出任务标签 */}
        {activeTab === "jobs" && (
          <div className="space-y-2">
            {jobs.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <p className="text-sm">暂无导出任务</p>
              </div>
            )}
            {jobs.map((job) => {
              const fmt = FORMAT_CONFIG[job.format];
              return (
                <div key={job.id} className="p-3 rounded-lg bg-card border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <fmt.icon className="size-5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{job.fileName}</p>
                      <p className="text-xs text-muted-foreground">{fmt.label}{job.fileSize ? ` · ${formatFileSize(job.fileSize)}` : ""}</p>
                    </div>
                    <span className={cn(
                      "px-2 py-0.5 text-xs rounded-full",
                      job.status === "completed" && "bg-green-500/20 text-green-400",
                      job.status === "processing" && "bg-primary/15 text-primary",
                      job.status === "pending" && "bg-gray-500/20 text-muted-foreground",
                      job.status === "failed" && "bg-red-500/20 text-red-400"
                    )}>
                      {job.status === "completed" ? "完成" : job.status === "processing" ? "处理中" : job.status === "pending" ? "等待" : "失败"}
                    </span>
                  </div>
                  {(job.status === "processing" || job.status === "pending") && (
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${job.progress}%` }} />
                    </div>
                  )}
                  {job.status === "failed" && job.error && (
                    <p className="text-xs text-red-400 mt-2">{job.error}</p>
                  )}
                  {job.status === "completed" && job.resultUrl && (
                    <a href={job.resultUrl} download className="mt-2 inline-block text-xs text-primary hover:text-blue-300">下载文件</a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export { FORMAT_CONFIG, EXPORT_PRESETS, formatFileSize };