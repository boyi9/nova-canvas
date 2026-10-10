import { useState, useRef, useEffect, useMemo } from "react";
import { Eye, EyeOff, Folder, Image, Link2, Lock, SlidersHorizontal, Square, Type, Unlock, FolderPlus, Plus, Trash2, MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PSDLayer {
  id: string;
  name: string;
  type: "layer" | "group" | "text" | "shape" | "smart_object" | "adjustment";
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: string;
  bounds: { x: number; y: number; width: number; height: number };
  children?: PSDLayer[];
  // 文本图层特有
  textContent?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  fontColor?: string;
  // 形状/智能对象特有
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  // 智能对象
  smartObjectUrl?: string;
  // 调整图层
  adjustmentType?: "levels" | "curves" | "hue_saturation" | "brightness_contrast" | "color_balance";
  adjustmentParams?: Record<string, any>;
  // 图层样式
  layerStyles?: {
    dropShadow?: { enabled: boolean; distance: number; size: number; opacity: number; angle: number; color: string };
    innerShadow?: { enabled: boolean; distance: number; size: number; opacity: number; angle: number; color: string };
    outerGlow?: { enabled: boolean; size: number; opacity: number; color: string; spread: number };
    innerGlow?: { enabled: boolean; size: number; opacity: number; color: string; spread: number };
    bevelEmboss?: { enabled: boolean; style: string; technique: string; depth: number; size: number; soften: number };
    colorOverlay?: { enabled: boolean; color: string; opacity: number; blendMode: string };
    gradientOverlay?: { enabled: boolean; gradient: string; opacity: number; angle: number; scale: number };
    stroke?: { enabled: boolean; size: number; color: string; opacity: number; position: string };
  };
  // 缩略图
  thumbnail?: string;
  // 位置索引（用于拖拽排序）
  index: number;
}

interface PSDLayerTreeProps {
  layers: PSDLayer[];
  onLayerSelect: (layer: PSDLayer | null) => void;
  onLayerUpdate: (layerId: string, updates: Partial<PSDLayer>) => void;
  onLayerReorder: (layerIds: string[]) => void;
  onLayerDuplicate: (layerId: string) => void;
  onLayerDelete: (layerId: string) => void;
  onGroupLayers: (layerIds: string[], groupName?: string) => void;
  onUngroupLayers: (groupId: string) => void;
  selectedLayerId: string | null;
  className?: string;
}

const BLEND_MODES = [
  "normal", "multiply", "screen", "overlay", "soft_light", "hard_light",
  "color_dodge", "color_burn", "darken", "lighten", "difference", "exclusion",
  "hue", "saturation", "color", "luminosity"
];

const LAYER_TYPE_CONFIG: Record<PSDLayer["type"], { icon: LucideIcon; color: string; label: string }> = {
  layer: { icon: Image, color: "text-primary", label: "图层" },
  group: { icon: Folder, color: "text-amber-400", label: "组" },
  text: { icon: Type, color: "text-green-400", label: "文本" },
  shape: { icon: Square, color: "text-purple-400", label: "形状" },
  smart_object: { icon: Link2, color: "text-orange-400", label: "智能对象" },
  adjustment: { icon: SlidersHorizontal, color: "text-pink-400", label: "调整" },
};

function LayerNode({
  layer,
  depth = 0,
  selectedLayerId,
  onSelect,
  onUpdate,
  onDuplicate,
  onDelete,
  onToggleVisibility,
  onToggleLock,
  expandedGroups,
  setExpandedGroups,
}: {
  layer: PSDLayer;
  depth: number;
  selectedLayerId: string | null;
  onSelect: (layer: PSDLayer | null) => void;
  onUpdate: (layerId: string, updates: Partial<PSDLayer>) => void;
  onDuplicate: (layerId: string) => void;
  onDelete: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  expandedGroups: Set<string>;
  setExpandedGroups: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const config = LAYER_TYPE_CONFIG[layer.type];
  const isSelected = selectedLayerId === layer.id;
  const isGroup = layer.type === "group";
  const hasChildren = isGroup && layer.children && layer.children.length > 0;
  const isExpanded = expandedGroups.has(layer.id);

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate(layer.id, { opacity: parseFloat(e.target.value) });
  };

  const handleBlendModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate(layer.id, { blendMode: e.target.value });
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate(layer.id, { name: e.target.value });
  };

  const toggleExpand = () => {
    if (hasChildren) {
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(layer.id)) next.delete(layer.id);
        else next.add(layer.id);
        return next;
      });
    }
  };

  return (
    <div className={cn("select-none", depth > 0 && "ml-6")}>
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5 rounded transition-colors",
          isSelected && "bg-primary/15 ring-1 ring-ring",
          !isSelected && "hover:bg-muted/50",
          layer.locked && "opacity-50",
          !layer.visible && "opacity-30"
        )}
        onClick={() => onSelect(layer)}
        onDoubleClick={() => isGroup && toggleExpand()}
      >
        {/* 展开/折叠图标 */}
        {hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex-shrink-0"
            aria-label={isExpanded ? "折叠" : "展开"}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points={isExpanded ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
            </svg>
          </button>
        )}

        {/* 图层类型图标 */}
        <config.icon className={cn("size-4 shrink-0", config.color)} />

        {/* 缩略图 */}
        {layer.thumbnail && (
          <img
            src={layer.thumbnail}
            alt=""
            className="w-6 h-6 rounded object-cover border border-border flex-shrink-0"
          />
        )}

        {/* 名称 */}
        <input
          type="text"
          defaultValue={layer.name}
          onBlur={(e) => { e.stopPropagation(); }}
          className={cn(
            "flex-1 min-w-0 bg-transparent border-none text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded px-1",
            layer.locked && "text-muted-foreground",
            !layer.visible && "line-through text-muted-foreground"
          )}
          onChange={(e) => { e.stopPropagation(); onUpdate(layer.id, { name: e.target.value }); }}
        />

        {/* 混合模式 */}
        <select
          defaultValue={layer.blendMode}
          onChange={(e) => { e.stopPropagation(); onUpdate(layer.id, { blendMode: e.target.value }); }}
          className="px-1 py-0.5 text-[10px] bg-muted border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {BLEND_MODES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* 不透明度 */}
        <input
          type="range"
          min="0"
          max="100"
          defaultValue={Math.round(layer.opacity * 100)}
          onChange={(e) => { e.stopPropagation(); onUpdate(layer.id, { opacity: parseInt(e.target.value) / 100 }); }}
          className="w-20 h-1.5 accent-blue-500"
        />
        <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round(layer.opacity * 100)}%</span>

        {/* 可见性 */}
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate(layer.id, { visible: !layer.visible }); }}
          className={cn("p-1 rounded hover:bg-muted", layer.visible ? "text-success" : "text-muted-foreground")}
          title={layer.visible ? "隐藏" : "显示"}
        >
          {layer.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>

        {/* 锁定 */}
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate(layer.id, { locked: !layer.locked }); }}
          className={cn("p-1 rounded hover:bg-muted", layer.locked ? "text-warning" : "text-muted-foreground")}
          title={layer.locked ? "解锁" : "锁定"}
        >
          {layer.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
        </button>

        {/* 更多操作 */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* 子图层 */}
      {hasChildren && isExpanded && (
        <div className="border-l border-border/50 ml-2">
          {layer.children?.map((child, index) => (
            <LayerNode
              key={child.id}
              layer={{ ...child, index }}
              depth={depth + 1}
              selectedLayerId={selectedLayerId}
              onSelect={onSelect}
              onUpdate={onUpdate}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onToggleVisibility={(id) => onUpdate(id, { visible: !layer.visible })}
              onToggleLock={(id) => onUpdate(id, { locked: !layer.locked })}
              expandedGroups={expandedGroups}
              setExpandedGroups={setExpandedGroups}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PSDLayerTree({
  layers,
  onLayerSelect,
  onLayerUpdate,
  onLayerReorder,
  onLayerDuplicate,
  onLayerDelete,
  onGroupLayers,
  onUngroupLayers,
  selectedLayerId,
  className,
}: PSDLayerTreeProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; layer: PSDLayer } | null>(null);
  const [draggingLayer, setDraggingLayer] = useState<PSDLayer | null>(null);

  // 默认展开第一层组
  useEffect(() => {
    layers.forEach((l) => { if (l.type === "group") expandedGroups.add(l.id); });
  }, []);

  const handleContextMenu = (e: React.MouseEvent, layer: PSDLayer) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, layer });
    onLayerSelect(layer);
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  return (
    <div className={cn("flex flex-col h-full bg-background overflow-auto", className)}>
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-2 p-2 border-b border-border bg-card">
        <h3 className="font-medium text-foreground">图层面板</h3>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="新建图层">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="新建组">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </button>
          <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="删除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* 图层列表 */}
      <div className="flex-1 overflow-auto p-2 space-y-0.5">
        {layers.map((layer) => (
          <LayerNode
            key={layer.id}
            layer={layer}
            depth={0}
            selectedLayerId={selectedLayerId}
            onSelect={onLayerSelect}
            onUpdate={onLayerUpdate}
            onDuplicate={onLayerDuplicate}
            onDelete={onLayerDelete}
            onToggleVisibility={(id) => onLayerUpdate(id, { visible: !layers.find(l => l.id === id)?.visible })}
            onToggleLock={(id) => onLayerUpdate(id, { locked: !layers.find(l => l.id === id)?.locked })}
            expandedGroups={expandedGroups}
            setExpandedGroups={setExpandedGroups}
          />
        ))}
        {layers.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 9h6v6H9z" />
            </svg>
            <p className="text-sm">暂无图层</p>
            <p className="text-xs text-muted-foreground mt-1">点击上方按钮创建</p>
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-card border border-border rounded-lg shadow-xl p-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button onClick={() => { onLayerDuplicate(contextMenu.layer.id); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted rounded">复制 (Ctrl+J)</button>
          <button onClick={() => { onGroupLayers([contextMenu.layer.id]); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted rounded">新建组 (Ctrl+G)</button>
          <button onClick={() => { onUngroupLayers(contextMenu.layer.id); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted rounded">取消编组 (Shift+Ctrl+G)</button>
          <hr className="my-1 border-border" />
          <button onClick={() => { onLayerUpdate(contextMenu.layer.id, { visible: !contextMenu.layer.visible }); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted rounded">
            {contextMenu.layer.visible ? "隐藏" : "显示"}
          </button>
          <button onClick={() => { onLayerUpdate(contextMenu.layer.id, { locked: !contextMenu.layer.locked }); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted rounded">
            {contextMenu.layer.locked ? "解锁" : "锁定"}
          </button>
          <hr className="my-1 border-border" />
          <button onClick={() => { onLayerDelete(contextMenu.layer.id); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-muted rounded">删除</button>
        </div>
      )}
    </div>
  );
}

export { BLEND_MODES, LAYER_TYPE_CONFIG };