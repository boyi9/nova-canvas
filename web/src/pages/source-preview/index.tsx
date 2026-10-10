import { useState, useCallback, useMemo } from "react";
import { Layers, PenTool, Scissors, Upload, type LucideIcon } from "lucide-react";
import { message } from "antd";
import { cn } from "@/lib/utils";
import { PSDLayerTree, type PSDLayer } from "@/canvas/components/preview/PSDLayerTree";
import { JianyingDraftPreview, type JianyingDraft } from "@/canvas/components/preview/JianyingDraftPreview";
import { SVGEditor, type SVGElement, buildSVG } from "@/canvas/components/preview/SVGEditor";
import { ExportPanel, type ExportJob, type ExportFormat } from "@/canvas/components/export/ExportPanel";
import { exportPsd, type PsdLayerInput } from "@/services/nova/api";

type PreviewMode = "psd" | "jianying" | "svg";

const MOCK_PSD_LAYERS: PSDLayer[] = [
  {
    id: "layer-1", name: "背景", type: "layer", visible: true, locked: false, opacity: 1, blendMode: "normal",
    bounds: { x: 0, y: 0, width: 1920, height: 1080 }, index: 0, thumbnail: "",
    layerStyles: {},
  },
  {
    id: "group-1", name: "产品主体", type: "group", visible: true, locked: false, opacity: 1, blendMode: "normal",
    bounds: { x: 460, y: 200, width: 1000, height: 700 }, index: 1,
    children: [
      { id: "layer-2", name: "产品图", type: "smart_object", visible: true, locked: false, opacity: 1, blendMode: "normal", bounds: { x: 460, y: 200, width: 1000, height: 700 }, index: 0 },
      { id: "layer-3", name: "阴影", type: "layer", visible: true, locked: false, opacity: 0.6, blendMode: "multiply", bounds: { x: 520, y: 780, width: 880, height: 150 }, index: 1 },
    ],
  },
  {
    id: "layer-4", name: "主标题文案", type: "text", visible: true, locked: false, opacity: 1, blendMode: "normal",
    bounds: { x: 160, y: 80, width: 1600, height: 120 }, index: 2,
    textContent: "秋冬新品 · 温暖上市", fontSize: 72, fontFamily: "思源黑体", fontWeight: 700, fontColor: "#1a1a1a",
  },
  {
    id: "layer-5", name: "价格标签", type: "shape", visible: true, locked: false, opacity: 1, blendMode: "normal",
    bounds: { x: 1500, y: 850, width: 300, height: 160 }, index: 3,
    fillColor: "#e53935", strokeColor: "#b71c1c", strokeWidth: 4,
  },
  {
    id: "adj-1", name: "色相/饱和度", type: "adjustment", visible: true, locked: false, opacity: 1, blendMode: "normal",
    bounds: { x: 0, y: 0, width: 0, height: 0 }, index: 4,
    adjustmentType: "hue_saturation", adjustmentParams: { hue: 0, saturation: 10, lightness: 0 },
  },
];

const MOCK_JIANYING_DRAFT: JianyingDraft = {
  metadata: { id: "draft-001", name: "秋冬上新短片", version: "6.0", duration: 30000000, width: 1920, height: 1080, fps: 30, createTime: Date.now(), updateTime: Date.now() },
  tracks: [
    {
      id: "track-video-1", type: "video", name: "主视频", attribute: 0, flag: 0,
      segments: [
        { id: "seg-1", materialId: "mat-video-1", trackId: "track-video-1", sourceTimerange: { start: 0, duration: 12000000 }, targetTimerange: { start: 0, duration: 12000000 }, visible: true, volume: 1, speed: 1 },
        { id: "seg-2", materialId: "mat-video-2", trackId: "track-video-1", sourceTimerange: { start: 0, duration: 10000000 }, targetTimerange: { start: 12000000, duration: 10000000 }, visible: true, volume: 1, speed: 1 },
        { id: "seg-3", materialId: "mat-video-3", trackId: "track-video-1", sourceTimerange: { start: 0, duration: 8000000 }, targetTimerange: { start: 22000000, duration: 8000000 }, visible: true, volume: 1, speed: 1 },
      ],
    },
    {
      id: "track-text-1", type: "text", name: "字幕", attribute: 0, flag: 0,
      segments: [
        { id: "seg-t1", materialId: "mat-text-1", trackId: "track-text-1", sourceTimerange: { start: 0, duration: 5000000 }, targetTimerange: { start: 500000, duration: 5000000 }, visible: true, volume: 1, speed: 1, text: "秋冬新品上市", fontSize: 48, fontColor: "#ffffff" },
        { id: "seg-t2", materialId: "mat-text-2", trackId: "track-text-1", sourceTimerange: { start: 0, duration: 5000000 }, targetTimerange: { start: 13000000, duration: 5000000 }, visible: true, volume: 1, speed: 1, text: "限时7折", fontSize: 56, fontColor: "#ffeb3b" },
      ],
    },
    {
      id: "track-audio-1", type: "audio", name: "背景音乐", attribute: 0, flag: 0,
      segments: [
        { id: "seg-a1", materialId: "mat-audio-1", trackId: "track-audio-1", sourceTimerange: { start: 0, duration: 30000000 }, targetTimerange: { start: 0, duration: 30000000 }, visible: true, volume: 0.8, speed: 1 },
      ],
    },
    {
      id: "track-effect-1", type: "effect", name: "特效", attribute: 0, flag: 0,
      segments: [
        { id: "seg-e1", materialId: "mat-effect-1", trackId: "track-effect-1", sourceTimerange: { start: 0, duration: 2000000 }, targetTimerange: { start: 11500000, duration: 2000000 }, visible: true, volume: 1, speed: 1, effectType: "fade_in" },
      ],
    },
  ],
  materials: [
    { id: "mat-video-1", type: "video", name: "产品展示1.mp4", path: "/videos/product1.mp4", duration: 12000000, width: 1920, height: 1080, fps: 30, hasAudio: true, hasVideo: true },
    { id: "mat-video-2", type: "video", name: "模特上身.mp4", path: "/videos/model.mp4", duration: 10000000, width: 1920, height: 1080, fps: 30, hasAudio: true, hasVideo: true },
    { id: "mat-video-3", type: "video", name: "细节特写.mp4", path: "/videos/detail.mp4", duration: 8000000, width: 1920, height: 1080, fps: 30, hasAudio: false, hasVideo: true },
    { id: "mat-text-1", type: "text", name: "字幕1", path: "", duration: 5000000, textContent: "秋冬新品上市", fontSize: 48, fontColor: "#ffffff" },
    { id: "mat-text-2", type: "text", name: "字幕2", path: "", duration: 5000000, textContent: "限时7折", fontSize: 56, fontColor: "#ffeb3b" },
    { id: "mat-audio-1", type: "audio", name: "BGM-温暖旋律.mp3", path: "/audio/bgm.mp3", duration: 30000000, hasAudio: true },
    { id: "mat-effect-1", type: "effect", name: "淡入", path: "", duration: 2000000 },
  ],
  canvasConfig: { width: 1920, height: 1080, backgroundColor: "#000000" },
};

const MOCK_SVG_ELEMENTS: SVGElement[] = [
  { id: "rect-1", type: "rect", name: "背景矩形", fill: "#1e293b", stroke: "#334155", strokeWidth: 2, opacity: 1, visible: true, locked: false, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, width: 800, height: 600 },
  { id: "ellipse-1", type: "ellipse", name: "装饰圆", fill: "#3b82f6", stroke: "#2563eb", strokeWidth: 2, opacity: 0.8, visible: true, locked: false, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, cx: 400, cy: 300, rx: 120, ry: 120 },
  { id: "text-1", type: "text", name: "标题", fill: "#ffffff", stroke: "none", strokeWidth: 0, opacity: 1, visible: true, locked: false, transform: { x: 400, y: 310, scaleX: 1, scaleY: 1, rotation: 0 }, textContent: "Nova Canvas", fontSize: 32, fontFamily: "sans-serif", fontWeight: 700, textAnchor: "middle" },
  { id: "rect-2", type: "rect", name: "按钮", fill: "#22c55e", stroke: "#16a34a", strokeWidth: 2, opacity: 1, visible: true, locked: false, transform: { x: 320, y: 400, scaleX: 1, scaleY: 1, rotation: 0 }, width: 160, height: 48, rx: 8 },
];

export default function SourcePreviewPage() {
  const [mode, setMode] = useState<PreviewMode>("psd");
  const [psdLayers, setPsdLayers] = useState<PSDLayer[]>(MOCK_PSD_LAYERS);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [svgElements, setSvgElements] = useState<SVGElement[]>(MOCK_SVG_ELEMENTS);
  const [svgContent, setSvgContent] = useState(() => buildSVG(MOCK_SVG_ELEMENTS));
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [exportSidebarOpen, setExportSidebarOpen] = useState(true);

  // PSD 回调
  const handlePSDLayerSelect = useCallback((layer: PSDLayer | null) => setSelectedLayerId(layer?.id ?? null), []);
  const handlePSDLayerUpdate = useCallback((layerId: string, updates: Partial<PSDLayer>) => {
    setPsdLayers((prev) => prev.map((l) => l.id === layerId ? { ...l, ...updates } : l));
  }, []);
  const handlePSDReorder = useCallback((layerIds: string[]) => {
    setPsdLayers((prev) => layerIds.map((id) => prev.find((l) => l.id === id)!).filter(Boolean));
  }, []);
  const handlePSDDuplicate = useCallback((layerId: string) => {
    setPsdLayers((prev) => {
      const target = prev.find((l) => l.id === layerId);
      if (!target) return prev;
      const copy = { ...target, id: `layer-${Date.now()}`, name: `${target.name} 副本` };
      const idx = prev.findIndex((l) => l.id === layerId);
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  }, []);
  const handlePSDDelete = useCallback((layerId: string) => {
    setPsdLayers((prev) => prev.filter((l) => l.id !== layerId));
    if (selectedLayerId === layerId) setSelectedLayerId(null);
  }, [selectedLayerId]);
  const handlePSDGroup = useCallback((layerIds: string[], groupName?: string) => {
    setPsdLayers((prev) => {
      const group: PSDLayer = {
        id: `group-${Date.now()}`, name: groupName || "新建组", type: "group",
        visible: true, locked: false, opacity: 1, blendMode: "normal",
        bounds: { x: 0, y: 0, width: 0, height: 0 }, index: prev.length,
        children: prev.filter((l) => layerIds.includes(l.id)),
      };
      return [...prev.filter((l) => !layerIds.includes(l.id)), group];
    });
  }, []);
  const handlePSDUngroup = useCallback((groupId: string) => {
    setPsdLayers((prev) => {
      const group = prev.find((l) => l.id === groupId);
      if (!group || !group.children) return prev;
      return [...prev.filter((l) => l.id !== groupId), ...group.children];
    });
  }, []);

  // SVG 回调
  const handleSVGElementUpdate = useCallback((id: string, updates: Partial<SVGElement>) => {
    setSvgElements((prev) => prev.map((e) => e.id === id ? { ...e, ...updates } : e));
    setSvgContent((prev) => { const els = svgElements.map((e) => e.id === id ? { ...e, ...updates } : e); return buildSVG(els); });
  }, [svgElements]);
  const handleSVGElementDelete = useCallback((id: string) => {
    setSvgElements((prev) => prev.filter((e) => e.id !== id));
    if (selectedElementId === id) setSelectedElementId(null);
  }, [selectedElementId]);
  const handleSVGElementDuplicate = useCallback((id: string) => {
    setSvgElements((prev) => {
      const target = prev.find((e) => e.id === id);
      if (!target) return prev;
      const copy = { ...target, id: `el-${Date.now()}`, name: `${target.name} 副本`, transform: { ...target.transform, x: target.transform.x + 20, y: target.transform.y + 20 } };
      return [...prev, copy];
    });
  }, []);

  // 剪映回调
  const handleJYSegmentSelect = useCallback((_segment: unknown, _track: unknown) => {}, []);
  const handleJYSegmentUpdate = useCallback((_segmentId: string, _updates: unknown) => {}, []);
  const handleJYTrackSelect = useCallback((_track: unknown) => {}, []);
  const handleJYMaterialSelect = useCallback((_material: unknown) => {}, []);

  // PSD 图层 → RGBA base64（按类型给纯色占位像素，真实场景应渲染图层）
  const buildPsdLayerInput = useCallback((layer: PSDLayer): PsdLayerInput | null => {
    const w = Math.max(1, Math.round(layer.bounds.width));
    const h = Math.max(1, Math.round(layer.bounds.height));
    // 按类型取色（R,G,B,A）
    const colorByType: Record<string, [number, number, number, number]> = {
      layer: [100, 149, 237, 255],
      smart_object: [60, 179, 113, 255],
      text: [220, 20, 60, 255],
      shape: [255, 165, 0, 255],
      adjustment: [147, 112, 219, 200],
      group: [128, 128, 128, 128],
    };
    const [r, g, b, a] = colorByType[layer.type] || [150, 150, 150, 255];
    const pixels = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      pixels[i * 4] = r;
      pixels[i * 4 + 1] = g;
      pixels[i * 4 + 2] = b;
      pixels[i * 4 + 3] = Math.round(a * (layer.opacity ?? 1));
    }
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < pixels.length; i += chunk) {
      binary += String.fromCharCode(...pixels.subarray(i, i + chunk));
    }
    return {
      name: layer.name,
      left: Math.round(layer.bounds.x),
      top: Math.round(layer.bounds.y),
      width: w,
      height: h,
      pixels_b64: btoa(binary),
      opacity: layer.opacity ?? 1,
      visible: layer.visible,
      blend_mode: layer.blendMode || "normal",
    };
  }, []);

  // 导出
  const handleExport = useCallback(async (format: ExportFormat, options: Record<string, any>) => {
    const jobId = `job-${Date.now()}`;
    const baseName = options.fileName || "export";
    const job: ExportJob = {
      id: jobId, fileName: `${baseName}.${format}`, format,
      progress: 0, status: "processing", createdAt: Date.now(),
    };
    setExportJobs((prev) => [job, ...prev]);

    const updateJob = (patch: Partial<ExportJob>) =>
      setExportJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...patch } : j)));

    // PSD：真实调用后端导出
    if (format === "psd") {
      try {
        const visibleLayers = psdLayers.filter((l) => l.visible && l.type !== "group");
        const layerInputs = visibleLayers
          .map(buildPsdLayerInput)
          .filter((x): x is PsdLayerInput => x !== null);
        if (layerInputs.length === 0) {
          throw new Error("没有可导出的可见图层");
        }
        const maxW = Math.max(...psdLayers.map((l) => l.bounds.x + l.bounds.width), 1920);
        const maxH = Math.max(...psdLayers.map((l) => l.bounds.y + l.bounds.height), 1080);
        const blob = await exportPsd(Math.round(maxW), Math.round(maxH), layerInputs);
        const url = URL.createObjectURL(blob);
        updateJob({
          progress: 100, status: "completed", resultUrl: url, fileSize: blob.size,
        });
        message.success("PSD 导出成功");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "PSD 导出失败";
        updateJob({ status: "failed", error: msg });
        message.error(msg);
      }
      return;
    }

    // 其他格式：模拟导出进度
    for (let p = 10; p <= 100; p += 20) {
      await new Promise((r) => setTimeout(r, 300));
      updateJob({
        progress: p,
        status: p >= 100 ? "completed" : "processing",
        resultUrl: p >= 100 ? URL.createObjectURL(new Blob(["mock"], { type: "text/plain" })) : undefined,
        fileSize: p >= 100 ? 1024 * 256 : undefined,
      });
    }
  }, [psdLayers, buildPsdLayerInput]);

  const modeConfig: Record<PreviewMode, { label: string; icon: LucideIcon; desc: string }> = {
    psd: { label: "PSD 图层", icon: Layers, desc: "分层结构、混合模式、图层样式" },
    jianying: { label: "剪映草稿", icon: Scissors, desc: "多轨时间线、素材库、片段属性" },
    svg: { label: "SVG 编辑", icon: PenTool, desc: "矢量绘制、属性编辑、源码同步" },
  };

  return (
    <div className="flex h-screen bg-background">
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部模式切换 */}
        <div className="flex items-center gap-2 p-3 border-b border-border bg-card">
          <span className="text-sm font-medium text-muted-foreground mr-2">源文件预览</span>
          {(["psd", "jianying", "svg"] as PreviewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                mode === m ? "bg-primary text-primary-foreground shadow-lg" : "bg-muted/50 text-foreground hover:bg-muted"
              )}
            >
              {(() => { const ModeIcon = modeConfig[m].icon; return <ModeIcon className="size-4" />; })()}
              <span>{modeConfig[m].label}</span>
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => setExportSidebarOpen(!exportSidebarOpen)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-success hover:bg-success/90 text-white"
          >
            <Upload className="size-4" />
            {exportSidebarOpen ? "隐藏导出" : "显示导出"}
          </button>
        </div>

        {/* 主内容区 */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 min-w-0">
            {mode === "psd" && (
              <div className="h-full flex">
                <div className="flex-1 bg-background flex items-center justify-center relative overflow-hidden">
                  {/* 模拟画布预览 */}
                  <div className="bg-white shadow-2xl relative" style={{ width: 640, height: 360 }}>
                    {psdLayers.filter((l) => l.visible).map((layer) => (
                      <div
                        key={layer.id}
                        className={cn("absolute border-2 cursor-pointer transition-all", selectedLayerId === layer.id ? "border-primary" : "border-transparent hover:border-primary/50")}
                        style={{
                          left: `${(layer.bounds.x / 1920) * 100}%`,
                          top: `${(layer.bounds.y / 1080) * 100}%`,
                          width: `${(layer.bounds.width / 1920) * 100}%`,
                          height: `${(layer.bounds.height / 1080) * 100}%`,
                          opacity: layer.opacity,
                          backgroundColor: layer.fillColor || (layer.type === "text" ? "transparent" : layer.type === "group" ? "rgba(59,130,246,0.1)" : "rgba(148,163,184,0.3)"),
                        }}
                        onClick={() => setSelectedLayerId(layer.id)}
                      >
                        {layer.type === "text" && (
                          <span className="absolute inset-0 flex items-center justify-center text-gray-800 font-bold text-center px-2" style={{ fontSize: Math.max(8, (layer.fontSize || 32) * 0.45) }}>
                            {layer.textContent}
                          </span>
                        )}
                        {layer.type === "shape" && <span className="absolute inset-0 flex items-center justify-center text-foreground font-bold text-lg">¥199</span>}
                      </div>
                    ))}
                    <div className="absolute bottom-1 left-1 text-[9px] text-muted-foreground font-mono">1920×1080 预览</div>
                  </div>
                  <p className="absolute top-3 left-3 text-xs text-muted-foreground">{modeConfig.psd.desc}</p>
                </div>

                <div className="w-96 flex-shrink-0 border-l border-border">
                  <PSDLayerTree
                    layers={psdLayers}
                    onLayerSelect={handlePSDLayerSelect}
                    onLayerUpdate={handlePSDLayerUpdate}
                    onLayerReorder={handlePSDReorder}
                    onLayerDuplicate={handlePSDDuplicate}
                    onLayerDelete={handlePSDDelete}
                    onGroupLayers={handlePSDGroup}
                    onUngroupLayers={handlePSDUngroup}
                    selectedLayerId={selectedLayerId}
                    className="h-full"
                  />
                </div>
              </div>
            )}

            {mode === "jianying" && (
              <div className="h-full">
                <JianyingDraftPreview
                  draft={MOCK_JIANYING_DRAFT}
                  onSegmentSelect={handleJYSegmentSelect}
                  onSegmentUpdate={handleJYSegmentUpdate}
                  onTrackSelect={handleJYTrackSelect}
                  onMaterialSelect={handleJYMaterialSelect}
                  className="h-full"
                />
              </div>
            )}

            {mode === "svg" && (
              <div className="h-full">
                <SVGEditor
                  svgContent={svgContent}
                  onUpdateSVG={setSvgContent}
                  elements={svgElements}
                  onElementUpdate={handleSVGElementUpdate}
                  onElementDelete={handleSVGElementDelete}
                  onElementDuplicate={handleSVGElementDuplicate}
                  selectedElementId={selectedElementId}
                  onSelectElement={setSelectedElementId}
                  className="h-full"
                />
              </div>
            )}
          </div>

          {/* 右侧导出面板 */}
          {exportSidebarOpen && (
            <div className="w-80 flex-shrink-0 border-l border-border">
              <ExportPanel onExport={handleExport} jobs={exportJobs} className="h-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}