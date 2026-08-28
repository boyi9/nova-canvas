import { saveAs } from "file-saver";

import i18n from "@/i18n";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeTypeId } from "@/types/canvas";

const DEFAULT_BACKGROUND = "#ffffff";
const PADDING = 48;
const LINE_HEIGHT = 18;
const CHAR_WIDTH = 8;

const TYPE_FILL: Record<string, string> = {
    [CanvasNodeType.Image]: "#FEF3C7",
    [CanvasNodeType.Text]: "#DBEAFE",
    [CanvasNodeType.Video]: "#FCE7F3",
    [CanvasNodeType.Audio]: "#DCFCE7",
    [CanvasNodeType.Config]: "#EDE9FE",
    [CanvasNodeType.Group]: "#F1F5F9",
};
const DEFAULT_FILL = "#F3F4F6";
const STROKE = "#94A3B8";
const TEXT_COLOR = "#0F172A";
const LABEL_COLOR = "#475569";

function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function typeLabel(type: CanvasNodeTypeId): string {
    return String(type).toUpperCase();
}

function nodeImageUrl(node: CanvasNodeData): string | undefined {
    const content = node.metadata?.content;
    if (typeof content === "string" && (content.startsWith("data:") || content.startsWith("http"))) return content;
    const firstImage = node.metadata?.images?.[0]?.content;
    if (typeof firstImage === "string" && (firstImage.startsWith("data:") || firstImage.startsWith("http"))) return firstImage;
    return undefined;
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
    const lines: string[] = [];
    for (const raw of text.split("\n")) {
        if (!raw) {
            lines.push("");
            continue;
        }
        for (let start = 0; start < raw.length; start += maxChars) {
            lines.push(raw.slice(start, start + maxChars));
            if (lines.length >= maxLines) return lines.slice(0, maxLines);
        }
    }
    return lines.slice(0, maxLines);
}

function renderTextNode(node: CanvasNodeData): string {
    const content = (node.metadata?.content || node.metadata?.prompt || node.title || "").toString();
    const maxChars = Math.max(1, Math.floor((node.width - 24) / CHAR_WIDTH));
    const maxLines = Math.max(1, Math.floor((node.height - 40) / LINE_HEIGHT));
    const lines = wrapLines(content, maxChars, maxLines);
    const tspans = lines
        .map((line, index) => `<tspan x="${node.position.x + 12}" dy="${index === 0 ? 28 : LINE_HEIGHT}">${escapeXml(line)}</tspan>`)
        .join("");
    return `<text font-family="system-ui, sans-serif" font-size="13" fill="${TEXT_COLOR}">${tspans}</text>`;
}

function renderImageNode(node: CanvasNodeData): string {
    const url = nodeImageUrl(node);
    if (!url) return "";
    const imageUrl = escapeXml(url);
    return `<image href="${imageUrl}" x="${node.position.x}" y="${node.position.y}" width="${node.width}" height="${node.height}" preserveAspectRatio="xMidYMid slice" />`;
}

function renderNode(node: CanvasNodeData): string {
    const { x, y } = node.position;
    const fill = TYPE_FILL[node.type] ?? DEFAULT_FILL;
    const rect = `<rect x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="14" ry="14" fill="${fill}" stroke="${STROKE}" stroke-width="1.5" />`;
    const label = `<text x="${x + 12}" y="${y + 18}" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="${LABEL_COLOR}" letter-spacing="0.5">${escapeXml(typeLabel(node.type))}</text>`;
    const body = node.type === CanvasNodeType.Image ? renderImageNode(node) : node.type === CanvasNodeType.Text ? renderTextNode(node) : "";
    const titleFallback =
        node.type === CanvasNodeType.Text || node.type === CanvasNodeType.Image
            ? ""
            : `<text x="${x + 12}" y="${y + node.height / 2}" font-family="system-ui, sans-serif" font-size="14" fill="${TEXT_COLOR}">${escapeXml(node.title || node.type)}</text>`;
    return `<g>${rect}${label}${body}${titleFallback}</g>`;
}

export function buildCanvasSvg(nodes: CanvasNodeData[], options: { background?: string; padding?: number } = {}): string {
    if (!nodes.length) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="${options.background ?? DEFAULT_BACKGROUND}" /></svg>`;
    }
    const padding = options.padding ?? PADDING;
    const background = options.background ?? DEFAULT_BACKGROUND;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + node.width);
        maxY = Math.max(maxY, node.position.y + node.height);
    }
    const viewX = minX - padding;
    const viewY = minY - padding;
    const viewW = maxX - minX + padding * 2;
    const viewH = maxY - minY + padding * 2;
    const bodies = nodes.map(renderNode).join("\n");
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(viewW)}" height="${Math.round(viewH)}" viewBox="${viewX} ${viewY} ${Math.round(viewW)} ${Math.round(viewH)}">`,
        `<rect x="${viewX}" y="${viewY}" width="${Math.round(viewW)}" height="${Math.round(viewH)}" fill="${background}" />`,
        bodies,
        `</svg>`,
    ].join("\n");
}

export async function exportCanvasSvg(nodes: CanvasNodeData[], fileName = i18n.t("canvas.exportSvgName")) {
    const svg = buildCanvasSvg(nodes);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    saveAs(blob, `${fileName}.svg`);
}
