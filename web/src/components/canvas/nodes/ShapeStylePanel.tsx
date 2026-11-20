import { X } from "lucide-react";
import { Slider } from "antd";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";
import { resolveShapeStyle } from "./shape-geometry";

type ShapeStylePanelProps = {
    node: CanvasNodeData;
    onMetadataChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onClose: () => void;
};

// 预设色板覆盖常用品牌/中性色，点击即改；颜色选择器用于自定义。
const FILL_PRESETS = ["#dbeafe", "#bfdbfe", "#93c5fd", "#2563eb", "#dcfce7", "#bbf7d0", "#22c55e", "#fef3c7", "#f8fafc", "#1e293b"];
const STROKE_PRESETS = ["#2563eb", "#1d4ed8", "#16a34a", "#15803d", "#ea580c", "#dc2626", "#7c3aed", "#0f172a", "#94a3b8"];

function ColorField({ field, label, value, presets, onPick, onClear }: { field: "fill" | "stroke"; label: string; value: string; presets: string[]; onPick: (color: string) => void; onClear: () => void }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="min-w-0" data-color-field={field}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium" style={{ color: theme.node.muted }}>
                    {label}
                </span>
                <div className="flex items-center gap-1.5">
                    <input
                        type="color"
                        className="h-6 w-6 cursor-pointer rounded-md border p-0"
                        style={{ background: theme.node.fill, borderColor: theme.toolbar.border }}
                        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#dbeafe"}
                        onChange={(event) => onPick(event.target.value)}
                    />
                    <button type="button" className="rounded-md px-1.5 py-0.5 text-[11px] transition hover:opacity-80" style={{ background: theme.node.fill, color: theme.node.text }} onClick={onClear}>
                        {t("canvas.shape.none")}
                    </button>
                </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {presets.map((color) => (
                    <button
                        key={color}
                        type="button"
                        title={color}
                        className="size-5 rounded-full border transition hover:scale-110"
                        style={{ background: color, borderColor: value === color ? theme.node.text : theme.toolbar.border }}
                        onClick={() => onPick(color)}
                    />
                ))}
            </div>
        </div>
    );
}

export function ShapeStylePanel({ node, onMetadataChange, onClose }: ShapeStylePanelProps) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isRectangle = node.type === CanvasNodeType.Rectangle;
    const style = resolveShapeStyle(node.metadata);

    return (
        <div
            data-testid="canvas-shape-style-panel"
            className="w-[360px] rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onWheel={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{t("canvas.shape.title")}</span>
                <button type="button" className="grid size-7 place-items-center rounded-lg opacity-60 transition hover:bg-white/10 hover:opacity-100" onClick={onClose} aria-label={t("common.close")}>
                    <X className="size-4" />
                </button>
            </div>

            <div className="flex flex-col gap-3">
                <ColorField field="fill" label={t("canvas.shape.fill")} value={style.fill} presets={FILL_PRESETS} onPick={(fill) => onMetadataChange(node.id, { fill })} onClear={() => onMetadataChange(node.id, { fill: "none" })} />
                <ColorField field="stroke" label={t("canvas.shape.stroke")} value={style.stroke} presets={STROKE_PRESETS} onPick={(stroke) => onMetadataChange(node.id, { stroke })} onClear={() => onMetadataChange(node.id, { stroke: "none" })} />

                <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs font-medium" style={{ color: theme.node.muted }}>
                        <span>{t("canvas.shape.strokeWidth")}</span>
                        <span>{style.strokeWidth}px</span>
                    </div>
                    <Slider min={0} max={16} step={0.5} value={style.strokeWidth} onChange={(strokeWidth) => onMetadataChange(node.id, { strokeWidth })} />
                </div>

                {isRectangle ? (
                    <div>
                        <div className="mb-1.5 flex items-center justify-between text-xs font-medium" style={{ color: theme.node.muted }}>
                            <span>{t("canvas.shape.cornerRadius")}</span>
                            <span>{style.cornerRadius}px</span>
                        </div>
                        <Slider min={0} max={120} step={1} value={style.cornerRadius} onChange={(cornerRadius) => onMetadataChange(node.id, { cornerRadius })} />
                    </div>
                ) : null}
            </div>

            <div className="mt-3 text-[11px] opacity-60">{t("canvas.shape.hint")}</div>
        </div>
    );
}
