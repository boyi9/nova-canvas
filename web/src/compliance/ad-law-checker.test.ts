import { describe, expect, it } from "vitest";

import { checkAdCompliance } from "./ad-law-checker";

describe("checkAdCompliance", () => {
    it("returns valid for clean text", () => {
        const r = checkAdCompliance("这款产品采用优质材料，深受用户喜爱");
        expect(r.isValid).toBe(true);
        expect(r.violations).toHaveLength(0);
        expect(r.score).toBe(100);
    });

    it("detects absolute terms and deducts score", () => {
        const r = checkAdCompliance("最好的产品，第一名的选择");
        expect(r.isValid).toBe(false);
        expect(r.violations.length).toBeGreaterThanOrEqual(2);
        expect(r.score).toBeLessThan(100);
        expect(r.violations[0].category).toBe("绝对化用语");
    });

    it("detects false claims", () => {
        const r = checkAdCompliance("祖传秘方，药到病除");
        expect(r.isValid).toBe(false);
        const cats = r.violations.map((v) => v.category);
        expect(cats).toContain("虚假宣传");
    });

    it("detects fake promotions", () => {
        const r = checkAdCompliance("仅限今日！最后一天！");
        expect(r.isValid).toBe(false);
        expect(r.violations.some((v) => v.category === "虚假促销")).toBe(true);
    });

    it("returns valid for empty string", () => {
        const r = checkAdCompliance("");
        expect(r.isValid).toBe(true);
        expect(r.score).toBe(100);
    });

    it("provides suggestions for each violation", () => {
        const r = checkAdCompliance("全网最低价");
        expect(r.violations.length).toBeGreaterThanOrEqual(1);
        expect(r.violations[0].suggestion).toBeTruthy();
        expect(typeof r.violations[0].suggestion).toBe("string");
    });
});
