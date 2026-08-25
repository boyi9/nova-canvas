import { describe, expect, it } from "vitest";

import { searchPrompts, type PromptItem } from "@/lib/prompt-library/cache";

const items: PromptItem[] = [
    { id: "1", title: "电商主图文案", content: "高点击率主图", tags: ["电商", "主图"], category: "ecommerce" },
    { id: "2", title: "TVC分镜脚本", content: "15秒品牌片", tags: ["广告", "TVC"], category: "advertising" },
    { id: "3", title: "短剧人物小传", content: "角色动机与关系", tags: ["短剧", "角色"], category: "drama" },
    { id: "4", title: "白底主图提示词", content: "studio product shot white background", tags: ["图像"], category: "image" },
];

describe("searchPrompts", () => {
    it("returns all items for an empty query", () => {
        expect(searchPrompts(items, "  ").length).toBe(4);
    });

    it("matches title prefix with highest rank", () => {
        const res = searchPrompts(items, "电商");
        expect(res[0].id).toBe("1");
    });

    it("matches within content/tags", () => {
        const res = searchPrompts(items, "TVC");
        expect(res.map((p) => p.id)).toContain("2");
    });

    it("returns nothing when there is no match", () => {
        expect(searchPrompts(items, "zzz-nope").length).toBe(0);
    });

    it("respects the limit", () => {
        expect(searchPrompts(items, "", 2).length).toBe(2);
    });

    it("ranks title-start matches above mid-title matches", () => {
        const data: PromptItem[] = [
            { id: "a", title: "x-主图", content: "", tags: [] },
            { id: "b", title: "主图-x", content: "", tags: [] },
        ];
        const res = searchPrompts(data, "主图");
        expect(res[0].id).toBe("b");
    });
});
