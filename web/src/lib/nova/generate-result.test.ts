import { describe, expect, it } from "vitest";

import { buildGenResult, type GenResult } from "./generate-result";

const imageRes = [
    { id: "i1", url: "https://x/1.jpg", prompt: "p1", model: "m" },
    { id: "i2", url: "https://x/2.jpg", prompt: "p2", model: "m" },
];

const adRes = {
    id: "a1",
    status: "ok",
    brief: "卖点文案",
    style: "tv",
    scenes: [
        { shot: 1, visual: "城市夜景", voiceover: "旁白一", duration: 3 },
        { shot: 2, visual: "产品特写", voiceover: "旁白二", duration: 4 },
    ],
};

describe("buildGenResult", () => {
    it("maps ecommerce BatchImageResult[] to images result", () => {
        const r = buildGenResult("ecommerce", imageRes);
        expect(r.kind).toBe("images");
        if (r.kind === "images") {
            expect(r.images).toHaveLength(2);
            expect(r.images[0]).toEqual({ id: "i1", url: "https://x/1.jpg", prompt: "p1" });
        }
    });

    it("returns an empty images array (not null) when backend returns nothing", () => {
        const r: GenResult = buildGenResult("ecommerce", []);
        expect(r).toEqual({ kind: "images", images: [] });
    });

    it("formats advertising scenes into readable text", () => {
        const r = buildGenResult("advertising", adRes);
        expect(r.kind).toBe("text");
        if (r.kind === "text") {
            expect(r.text).toContain("镜头 1（3s）");
            expect(r.text).toContain("画面：城市夜景");
            expect(r.text).toContain("配音：旁白一");
            expect(r.text).toContain("镜头 2（4s）");
        }
    });

    it("falls back to brief when advertising has no scenes", () => {
        const r = buildGenResult("advertising", { ...adRes, scenes: [] });
        expect(r).toEqual({ kind: "text", text: "卖点文案" });
    });

    it("maps drama/other chat reply to text", () => {
        const r = buildGenResult("drama", { reply: "剧情大纲..." });
        expect(r).toEqual({ kind: "text", text: "剧情大纲..." });
    });
});
