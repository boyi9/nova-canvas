import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";

const FALLBACK_FILL = "#dbeafe";
const FALLBACK_STROKE = "#2563eb";
const FALLBACK_STROKE_WIDTH = 2;

// 图元描边以世界坐标为单位，缩放画布时描边随内容一起缩放，与导出坐标保持一致。
export function resolveShapeStyle(metadata?: CanvasNodeMetadata) {
    const strokeWidth = metadata?.strokeWidth;
    return {
        fill: metadata?.fill?.trim() || FALLBACK_FILL,
        stroke: metadata?.stroke?.trim() || FALLBACK_STROKE,
        strokeWidth: typeof strokeWidth === "number" && Number.isFinite(strokeWidth) ? Math.max(strokeWidth, 0) : FALLBACK_STROKE_WIDTH,
        cornerRadius: typeof metadata?.cornerRadius === "number" && Number.isFinite(metadata.cornerRadius) ? Math.max(metadata.cornerRadius, 0) : 0,
    };
}

export type ShapeGeometry = { kind: "rect"; x: number; y: number; width: number; height: number; rx: number } | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number };

/**
 * 计算图元在节点本地坐标中的几何参数。
 * 描边居中绘制，因此按 strokeWidth / 2 内缩，避免描边被节点边界裁掉。
 */
export function getShapeGeometry(type: CanvasNodeData["type"], width: number, height: number, metadata?: CanvasNodeMetadata): ShapeGeometry {
    const safeWidth = Number.isFinite(width) ? Math.max(width, 0) : 0;
    const safeHeight = Number.isFinite(height) ? Math.max(height, 0) : 0;
    const { strokeWidth, cornerRadius } = resolveShapeStyle(metadata);
    const inset = strokeWidth / 2;
    const innerWidth = Math.max(safeWidth - strokeWidth, 0);
    const innerHeight = Math.max(safeHeight - strokeWidth, 0);

    if (type === CanvasNodeType.Circle) {
        return { kind: "ellipse", cx: safeWidth / 2, cy: safeHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2 };
    }

    return {
        kind: "rect",
        x: inset,
        y: inset,
        width: innerWidth,
        height: innerHeight,
        rx: Math.min(cornerRadius, Math.min(innerWidth, innerHeight) / 2),
    };
}
