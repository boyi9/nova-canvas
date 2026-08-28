import PptxGenJS from "pptxgenjs";

import i18n from "@/i18n";
import { getImageBlob } from "@/services/image-storage";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeTypeId } from "@/types/canvas";

export interface PptxSlideSpec {
    title: string;
    type: string;
    text?: string;
    imageData?: string;
    imageStorageKey?: string;
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

export function buildPptxSlides(nodes: CanvasNodeData[]): PptxSlideSpec[] {
    return nodes.map((node) => {
        const type = String(node.type) as CanvasNodeTypeId;
        if (node.type === CanvasNodeType.Image) {
            const content = typeof node.metadata?.content === "string" ? node.metadata.content : "";
            const isEmbeddable = content.startsWith("data:") || content.startsWith("http");
            return {
                title: node.title || i18n.t("canvas.exportPptxImageTitle"),
                type,
                text: node.metadata?.prompt ? String(node.metadata.prompt) : undefined,
                imageData: isEmbeddable ? content : undefined,
                imageStorageKey: isEmbeddable ? undefined : (node.metadata?.storageKey as string | undefined),
            };
        }
        const text =
            node.type === CanvasNodeType.Text
                ? node.metadata?.content || node.metadata?.prompt || ""
                : node.metadata?.prompt || node.title || "";
        return {
            title: node.title || type.toUpperCase(),
            type,
            text: text ? String(text) : undefined,
        };
    });
}

export async function exportCanvasPptx(nodes: CanvasNodeData[], fileName = i18n.t("canvas.exportPptxName")) {
    const specs = buildPptxSlides(nodes);
    await Promise.all(
        specs.map(async (spec) => {
            if (!spec.imageStorageKey) return;
            try {
                const blob = await getImageBlob(spec.imageStorageKey);
                if (blob) spec.imageData = await blobToDataUrl(blob);
            } catch {
                spec.imageData = undefined;
            }
            spec.imageStorageKey = undefined;
        }),
    );

    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    if (!specs.length) {
        const slide = pptx.addSlide();
        slide.addText(i18n.t("canvas.noNodes"), { x: 0.5, y: 2.5, w: 12, h: 1, fontSize: 20, align: "center" });
    }
    for (const spec of specs) {
        const slide = pptx.addSlide();
        slide.addText(spec.title, { x: 0.5, y: 0.3, w: 12.3, h: 0.7, fontSize: 24, bold: true, color: "1F2937" });
        if (spec.imageData) {
            slide.addImage({ data: spec.imageData, x: 0.5, y: 1.15, w: 12.3, h: 6.0, sizing: { type: "contain", w: 12.3, h: 6.0 } });
        } else if (spec.text) {
            slide.addText(spec.text, { x: 0.5, y: 1.15, w: 12.3, h: 6.0, fontSize: 16, valign: "top", color: "111827" });
        }
    }
    await pptx.writeFile({ fileName: `${fileName}.pptx` });
}
