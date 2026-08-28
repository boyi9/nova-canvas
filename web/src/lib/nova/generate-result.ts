// Nova启画 - 首页「一键生成」结果映射（纯函数，便于单测与边界处理）
import type { SceneId } from "@/config/nova-config";
import type { AdScriptResult, BatchImageResult } from "@/services/nova/api";

export type GenImageResult = { id: string; url: string; prompt: string };

export type GenResult =
    | { kind: "images"; images: GenImageResult[] }
    | { kind: "text"; text: string };

/**
 * 将后端各场景的返回结构统一映射为工作台可渲染的 GenResult。
 * 对空结果做兜底，避免出现「空白卡片」式的破碎 UI。
 */
export function buildGenResult(
    scene: SceneId,
    res: BatchImageResult[] | AdScriptResult | { reply: string },
): GenResult {
    if (scene === "ecommerce") {
        const images = ((res as BatchImageResult[]) || []).map((image) => ({
            id: image.id,
            url: image.url,
            prompt: image.prompt,
        }));
        return { kind: "images", images };
    }

    if (scene === "advertising") {
        const ad = res as AdScriptResult;
        const text = (ad.scenes || [])
            .map((shot) => `镜头 ${shot.shot}（${shot.duration}s）\n画面：${shot.visual}\n配音：${shot.voiceover}`)
            .join("\n\n");
        return { kind: "text", text: text || ad.brief || "" };
    }

    const chat = res as { reply: string };
    return { kind: "text", text: chat.reply || "" };
}
