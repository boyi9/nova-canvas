import { useState, useRef, useCallback, useEffect } from "react";
import { Box, Circle, Copy, Eye, EyeOff, Hexagon, Maximize, Minus, MousePointer2, PenTool, Square, Trash2, Type } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SVGElement {
  id: string;
  type: "rect" | "circle" | "ellipse" | "line" | "path" | "text" | "polygon" | "group";
  name: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  transform: { x: number; y: number; scaleX: number; scaleY: number; rotation: number };
  // 形状属性
  width?: number;
  height?: number;
  rx?: number;
  ry?: number;
  cx?: number;
  cy?: number;
  r?: number;
  points?: string;
  d?: string;
  // 文本属性
  textContent?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  textAnchor?: "start" | "middle" | "end";
  // 路径编辑
  pathPoints?: { x: number; y: number; type: "line" | "curve"; cp1x?: number; cp1y?: number; cp2x?: number; cp2y?: number }[];
  children?: SVGElement[];
}

interface SVGEditorProps {
  svgContent: string;
  onUpdateSVG: (content: string) => void;
  elements: SVGElement[];
  onElementUpdate: (id: string, updates: Partial<SVGElement>) => void;
  onElementDelete: (id: string) => void;
  onElementDuplicate: (id: string) => void;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  className?: string;
}

const TOOLS = [
  { id: "select", label: "选择", icon: MousePointer2, shortcut: "V" },
  { id: "rect", label: "矩形", icon: Square, shortcut: "R" },
  { id: "ellipse", label: "椭圆", icon: Circle, shortcut: "O" },
  { id: "line", label: "直线", icon: Minus, shortcut: "L" },
  { id: "path", label: "路径", icon: PenTool, shortcut: "P" },
  { id: "text", label: "文本", icon: Type, shortcut: "T" },
  { id: "polygon", label: "多边形", icon: Hexagon, shortcut: "N" },
] as const;

type Tool = (typeof TOOLS)[number]["id"];

export function SVGEditor({
  svgContent,
  onUpdateSVG,
  elements,
  onElementUpdate,
  onElementDelete,
  onElementDuplicate,
  selectedElementId,
  onSelectElement,
  className,
}: SVGEditorProps) {
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 800, height: 600 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize, setGridSize] = useState(10);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showRulers, setShowRulers] = useState(true);
  const [history, setHistory] = useState<string[]>([svgContent]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const svgRef = useRef<SVGSVGElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const selectedElement = elements.find((e) => e.id === selectedElementId);

  const pushHistory = useCallback((content: string) => {
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), content]);
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      onUpdateSVG(history[historyIndex - 1]);
    }
  }, [history, historyIndex, onUpdateSVG]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      onUpdateSVG(history[historyIndex + 1]);
    }
  }, [history, historyIndex, onUpdateSVG]);

  const getMousePos = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom + viewBox.x;
    const y = (e.clientY - rect.top) / zoom + viewBox.y;
    return snapToGrid ? { x: Math.round(x / gridSize) * gridSize, y: Math.round(y / gridSize) * gridSize } : { x, y };
  }, [viewBox, zoom, snapToGrid, gridSize]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }
    if (activeTool === "select") return;
    const pos = getMousePos(e);
    setIsDrawing(true);
    setDrawStart(pos);
  }, [activeTool, getMousePos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = (e.clientX - panStart.x) / zoom;
      const dy = (e.clientY - panStart.y) / zoom;
      setViewBox((prev) => ({ ...prev, x: prev.x - dx, y: prev.y - dy }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }
  }, [isPanning, panStart, zoom]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isPanning) { setIsPanning(false); return; }
    if (!isDrawing) return;
    setIsDrawing(false);
    const pos = getMousePos(e);
    const x = Math.min(drawStart.x, pos.x);
    const y = Math.min(drawStart.y, pos.y);
    const w = Math.abs(pos.x - drawStart.x);
    const h = Math.abs(pos.y - drawStart.y);
    if (w < 2 && h < 2) return;

    const id = `el-${Date.now()}`;
    const base: SVGElement = {
      id, type: "rect", name: `${activeTool} ${id.slice(-4)}`,
      fill: "#3b82f6", stroke: "#1d4ed8", strokeWidth: 2, opacity: 1,
      visible: true, locked: false,
      transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0 },
    };

    if (activeTool === "rect" || activeTool === "polygon") {
      onElementUpdate(id, { ...base, width: w, height: h, type: "rect" });
    } else if (activeTool === "ellipse") {
      onElementUpdate(id, { ...base, type: "ellipse", cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 });
    } else if (activeTool === "line") {
      onElementUpdate(id, { ...base, type: "line", d: `M ${drawStart.x} ${drawStart.y} L ${pos.x} ${pos.y}`, width: w, height: h });
    } else if (activeTool === "text") {
      onElementUpdate(id, { ...base, type: "text", width: Math.max(w, 80), height: Math.max(h, 24), textContent: "文本", fontSize: 16 });
    }
    setActiveTool("select");
  }, [isDrawing, drawStart, activeTool, getMousePos, onElementUpdate]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(8, Math.max(0.1, zoom * delta));
    setZoom(newZoom);
  }, [zoom]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Delete" && selectedElementId) { onElementDelete(selectedElementId); return; }
    if (e.key === "Escape") { onSelectElement(null); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); handleUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); handleRedo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === "d" && selectedElementId) { e.preventDefault(); onElementDuplicate(selectedElementId); return; }
    const tool = TOOLS.find((t) => t.shortcut.toLowerCase() === e.key.toLowerCase());
    if (tool && !e.ctrlKey && !e.metaKey) setActiveTool(tool.id);
  }, [selectedElementId, onElementDelete, onSelectElement, handleUndo, handleRedo, onElementDuplicate]);

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    el.addEventListener("keydown", handleKeyDown as any);
    return () => el.removeEventListener("keydown", handleKeyDown as any);
  }, [handleKeyDown]);

  const renderElement = (el: SVGElement) => {
    if (!el.visible) return null;
    const t = el.transform;
    const transform = `translate(${t.x}, ${t.y}) rotate(${t.rotation}) scale(${t.scaleX}, ${t.scaleY})`;
    const common = {
      id: el.id, opacity: el.opacity, cursor: el.locked ? "not-allowed" : "pointer",
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); if (!el.locked) onSelectElement(el.id); },
      style: { transform },
    };

    switch (el.type) {
      case "rect":
        return <rect key={el.id} {...common} width={el.width || 0} height={el.height || 0} rx={el.rx || 0} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} />;
      case "ellipse":
        return <ellipse key={el.id} {...common} cx={el.cx || 0} cy={el.cy || 0} rx={el.rx || 0} ry={el.ry || 0} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} />;
      case "line":
        return <line key={el.id} {...common} d={el.d} stroke={el.stroke} strokeWidth={el.strokeWidth} strokeLinecap="round" />;
      case "text":
        return (
          <text key={el.id} {...common} x={0} y={0} fontSize={el.fontSize || 16} fontFamily={el.fontFamily || "sans-serif"} fontWeight={el.fontWeight || 400} fill={el.fill} textAnchor={el.textAnchor || "start"}>
            {el.textContent}
          </text>
        );
      case "path":
        return <path key={el.id} {...common} d={el.d} fill={el.type === "path" ? el.fill : "none"} stroke={el.stroke} strokeWidth={el.strokeWidth} />;
      default:
        return null;
    }
  };

  const renderGrid = () => {
    if (!showGrid) return null;
    const lines = [];
    const step = gridSize * zoom;
    const w = viewBox.width * zoom;
    const h = viewBox.height * zoom;
    for (let x = 0; x <= w; x += step) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={h} stroke="#374151" strokeWidth={0.5} opacity={0.3} />);
    for (let y = 0; y <= h; y += step) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={w} y2={y} stroke="#374151" strokeWidth={0.5} opacity={0.3} />);
    return <g>{lines}</g>;
  };

  const handlePropertyUpdate = (prop: string, value: any) => {
    if (!selectedElementId) return;
    if (prop.startsWith("transform.")) {
      const key = prop.split(".")[1];
      onElementUpdate(selectedElementId, { transform: { ...selectedElement!.transform, [key]: value } });
    } else {
      onElementUpdate(selectedElementId, { [prop]: value } as any);
    }
    pushHistory(svgContent);
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)} tabIndex={0}>
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-2 p-2 border-b border-border bg-card flex-wrap">
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={cn(
                "px-2.5 py-1.5 rounded text-sm transition-colors",
                activeTool === tool.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
              )}
              title={`${tool.label} (${tool.shortcut})`}
            >
              <tool.icon className="mr-1 size-4" />
              <span className="hidden lg:inline">{tool.label}</span>
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-muted" />

        <button onClick={handleUndo} disabled={historyIndex === 0} className="px-2 py-1.5 rounded text-sm text-foreground hover:bg-muted disabled:opacity-30" title="撤销 (Ctrl+Z)">↩ 撤销</button>
        <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="px-2 py-1.5 rounded text-sm text-foreground hover:bg-muted disabled:opacity-30" title="重做 (Ctrl+Y)">↪ 重做</button>

        <div className="w-px h-6 bg-muted" />

        <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="accent-blue-500" />网格</label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} className="accent-blue-500" />吸附</label>
        <input type="number" value={gridSize} onChange={(e) => setGridSize(Math.max(1, Number(e.target.value)))} className="w-14 px-1.5 py-1 text-xs bg-muted border border-border rounded text-foreground" title="网格大小" />

        <div className="w-px h-6 bg-muted" />

        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2 py-1">
          <button onClick={() => setZoom(Math.max(0.1, zoom * 0.8))} className="px-1 text-foreground hover:text-foreground">−</button>
          <span className="text-xs text-muted-foreground font-mono w-14 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(Math.min(8, zoom * 1.25))} className="px-1 text-foreground hover:text-foreground">+</button>
          <button onClick={() => { setZoom(1); setViewBox({ x: 0, y: 0, width: 800, height: 600 }); }} className="px-1.5 text-foreground hover:text-foreground" title="适应窗口"><Maximize className="size-3.5" /></button>
        </div>

        <div className="w-px h-6 bg-muted" />

        <button onClick={() => onUpdateSVG(buildSVG(elements, viewBox))} className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm rounded-lg">更新预览</button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 画布 */}
        <div ref={canvasContainerRef} className="flex-1 relative overflow-hidden bg-background outline-none" style={{ cursor: activeTool === "select" ? (isPanning ? "grabbing" : "default") : "crosshair" }}>
          <svg
            ref={svgRef}
            className="w-full h-full"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width / zoom} ${viewBox.height / zoom}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onClick={() => onSelectElement(null)}
          >
            <defs>
              <pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="#374151" strokeWidth="0.5" opacity="0.3" />
              </pattern>
            </defs>
            {showGrid && <rect width="100%" height="100%" fill="url(#grid)" />}
            {elements.map(renderElement)}
            {selectedElement && (
              <g className="pointer-events-none">
                <rect
                  x={selectedElement.transform.x - 4}
                  y={selectedElement.transform.y - 4}
                  width={(selectedElement.width || selectedElement.rx || 50) + 8}
                  height={(selectedElement.height || selectedElement.ry || 50) + 8}
                  fill="none" stroke="#3b82f6" strokeWidth={2 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                />
              </g>
            )}
            {isDrawing && (
              <line x1={drawStart.x} y1={drawStart.y} x2={drawStart.x} y2={drawStart.y} stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={1 / zoom} />
            )}
          </svg>
        </div>

        {/* 右侧：图层 + 属性 */}
        <div className="w-72 flex-shrink-0 bg-card border-l border-border flex flex-col overflow-hidden">
          {/* 元素列表 */}
          <div className="border-b border-border">
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">图元 ({elements.length})</span>
              {selectedElementId && (
                <div className="flex gap-1">
                  <button onClick={() => onElementDuplicate(selectedElementId)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="复制 (Ctrl+D)"><Copy className="size-4" /></button>
                  <button onClick={() => onElementDelete(selectedElementId)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="删除 (Del)"><Trash2 className="size-4" /></button>
                </div>
              )}
            </div>
            <div className="max-h-40 overflow-y-auto">
              {elements.map((el) => (
                <div
                  key={el.id}
                  onClick={() => onSelectElement(el.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm",
                    selectedElementId === el.id ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-muted",
                    !el.visible && "opacity-40"
                  )}
                >
                  {(() => { const ElIcon = el.type === "rect" ? Square : el.type === "ellipse" ? Circle : el.type === "text" ? Type : el.type === "path" ? PenTool : Box; return <ElIcon className="size-3.5 shrink-0" />; })()}
                  <span className="flex-1 truncate">{el.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); onElementUpdate(el.id, { visible: !el.visible }); }} className="opacity-60 hover:opacity-100">
                    {el.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                </div>
              ))}
              {elements.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground text-center">使用工具绘制图元</p>}
            </div>
          </div>

          {/* 属性面板 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {selectedElement ? (
              <>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">名称</label>
                  <input type="text" value={selectedElement.name} onChange={(e) => handlePropertyUpdate("name", e.target.value)} className="w-full px-2 py-1.5 text-sm bg-muted border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">填充</label>
                    <input type="color" value={selectedElement.fill} onChange={(e) => handlePropertyUpdate("fill", e.target.value)} className="w-full h-8 rounded cursor-pointer" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">描边</label>
                    <input type="color" value={selectedElement.stroke} onChange={(e) => handlePropertyUpdate("stroke", e.target.value)} className="w-full h-8 rounded cursor-pointer" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">描边宽度</label>
                    <input type="number" min="0" value={selectedElement.strokeWidth} onChange={(e) => handlePropertyUpdate("strokeWidth", Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-muted border border-border rounded text-foreground" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">不透明度</label>
                    <input type="range" min="0" max="1" step="0.05" value={selectedElement.opacity} onChange={(e) => handlePropertyUpdate("opacity", Number(e.target.value))} className="w-full accent-blue-500 mt-2" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">X</label>
                    <input type="number" value={Math.round(selectedElement.transform.x)} onChange={(e) => handlePropertyUpdate("transform.x", Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-muted border border-border rounded text-foreground" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Y</label>
                    <input type="number" value={Math.round(selectedElement.transform.y)} onChange={(e) => handlePropertyUpdate("transform.y", Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-muted border border-border rounded text-foreground" />
                  </div>
                </div>

                {(selectedElement.type === "rect") && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">宽</label>
                      <input type="number" value={selectedElement.width} onChange={(e) => handlePropertyUpdate("width", Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-muted border border-border rounded text-foreground" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">高</label>
                      <input type="number" value={selectedElement.height} onChange={(e) => handlePropertyUpdate("height", Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-muted border border-border rounded text-foreground" />
                    </div>
                  </div>
                )}

                {selectedElement.type === "text" && (
                  <>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">文本内容</label>
                      <input type="text" value={selectedElement.textContent} onChange={(e) => handlePropertyUpdate("textContent", e.target.value)} className="w-full px-2 py-1.5 text-sm bg-muted border border-border rounded text-foreground" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">字号</label>
                        <input type="number" min="1" value={selectedElement.fontSize} onChange={(e) => handlePropertyUpdate("fontSize", Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-muted border border-border rounded text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">字重</label>
                        <select value={selectedElement.fontWeight} onChange={(e) => handlePropertyUpdate("fontWeight", Number(e.target.value))} className="w-full px-2 py-1.5 text-sm bg-muted border border-border rounded text-foreground">
                          <option value={400}>常规</option>
                          <option value={500}>中粗</option>
                          <option value={700}>粗体</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">缩放X</label>
                    <input type="number" step="0.1" value={selectedElement.transform.scaleX} onChange={(e) => handlePropertyUpdate("transform.scaleX", Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-muted border border-border rounded text-foreground" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">缩放Y</label>
                    <input type="number" step="0.1" value={selectedElement.transform.scaleY} onChange={(e) => handlePropertyUpdate("transform.scaleY", Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-muted border border-border rounded text-foreground" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">旋转</label>
                    <input type="number" value={selectedElement.transform.rotation} onChange={(e) => handlePropertyUpdate("transform.rotation", Number(e.target.value))} className="w-full px-2 py-1 text-sm bg-muted border border-border rounded text-foreground" />
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <p className="text-sm">选择图元编辑属性</p>
                <p className="text-xs text-muted-foreground mt-1">快捷键: V/R/O/L/P/T/N</p>
              </div>
            )}
          </div>

          {/* 原始 SVG 代码 */}
          <div className="border-t border-border p-3">
            <label className="text-xs text-muted-foreground block mb-1">SVG 源码</label>
            <textarea
              value={svgContent}
              onChange={(e) => onUpdateSVG(e.target.value)}
              rows={4}
              className="w-full px-2 py-1.5 text-xs font-mono bg-background border border-border rounded text-green-400 focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function buildSVG(elements: SVGElement[], viewBox?: { x: number; y: number; width: number; height: number }): string {
  const inner = elements.map((el) => {
    const t = el.transform;
    const transform = `translate(${t.x},${t.y}) rotate(${t.rotation}) scale(${t.scaleX},${t.scaleY})`;
    const style = `opacity:${el.opacity};${el.visible ? "" : "display:none;"}`;
    switch (el.type) {
      case "rect": return `<rect transform="${transform}" width="${el.width || 0}" height="${el.height || 0}" rx="${el.rx || 0}" fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" style="${style}" />`;
      case "ellipse": return `<ellipse transform="${transform}" cx="${el.cx || 0}" cy="${el.cy || 0}" rx="${el.rx || 0}" ry="${el.ry || 0}" fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" style="${style}" />`;
      case "line": return `<path transform="${transform}" d="${el.d || ""}" fill="none" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" stroke-linecap="round" style="${style}" />`;
      case "text": return `<text transform="${transform}" font-size="${el.fontSize || 16}" font-family="${el.fontFamily || "sans-serif"}" font-weight="${el.fontWeight || 400}" fill="${el.fill}" text-anchor="${el.textAnchor || "start"}" style="${style}">${(el.textContent || "").replace(/</g, "&lt;")}</text>`;
      case "path": return `<path transform="${transform}" d="${el.d || ""}" fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" style="${style}" />`;
      default: return "";
    }
  }).join("\n  ");
  const vb = viewBox || { x: 0, y: 0, width: 800, height: 600 };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}">\n  ${inner}\n</svg>`;
}
