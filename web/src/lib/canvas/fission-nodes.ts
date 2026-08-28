import { createCanvasNode } from "@/lib/canvas/canvas-node-factory";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import type { FissionVariant } from "@/services/nova/api";

const NODE_STATUS_SUCCESS = "success" as const;

const COLUMNS = 3;
const GAP_X = 340;
const GAP_Y = 260;

export function fissionNodeContent(variant: FissionVariant): string {
    return `#${variant.index} · ${variant.hook}\n${variant.copy}\n[镜头] ${variant.shot} · [节奏] ${variant.rhythm}`;
}

export function buildFissionNodes(variants: FissionVariant[], origin: { x: number; y: number } = { x: 0, y: 0 }): CanvasNodeData[] {
    return variants.map((variant, index) => {
        const column = index % COLUMNS;
        const row = Math.floor(index / COLUMNS);
        const position = { x: origin.x + column * GAP_X, y: origin.y + row * GAP_Y };
        const content = fissionNodeContent(variant);
        return createCanvasNode(CanvasNodeType.Text, position, {
            content,
            prompt: variant.copy,
            status: NODE_STATUS_SUCCESS,
        });
    });
}
