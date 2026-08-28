import { describe, expect, it } from "vitest";

import type { FissionVariant } from "@/services/nova/api";

import { buildFissionNodes, fissionNodeContent } from "./fission-nodes";

const variants: FissionVariant[] = [
    { index: 1, hook: "痛点开场", rhythm: "快节奏", shot: "特写", copy: "熬夜党必看" },
    { index: 2, hook: "反常识", rhythm: "中节奏", shot: "场景", copy: "你以为的都错了" },
    { index: 3, hook: "情绪共鸣", rhythm: "慢节奏", shot: "全景", copy: "谁懂啊" },
    { index: 4, hook: "数字冲击", rhythm: "快节奏", shot: "分屏", copy: "3 天涨粉 1 万" },
];

describe("buildFissionNodes", () => {
    it("creates one text node per variant", () => {
        const nodes = buildFissionNodes(variants, { x: 100, y: 200 });
        expect(nodes).toHaveLength(variants.length);
        expect(nodes.every((node) => node.type === "text")).toBe(true);
    });

    it("embeds hook/copy/shot/rhythm into node content", () => {
        const [first] = buildFissionNodes(variants, { x: 0, y: 0 });
        expect(first.metadata?.content).toBe(fissionNodeContent(variants[0]));
        expect(first.metadata?.content).toContain("痛点开场");
        expect(first.metadata?.content).toContain("熬夜党必看");
    });

    it("lays nodes out in a 3-column grid from the origin", () => {
        const nodes = buildFissionNodes(variants, { x: 0, y: 0 });
        const delta = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x - b.x, y: a.y - b.y });
        expect(delta(nodes[1].position, nodes[0].position)).toEqual({ x: 340, y: 0 });
        expect(delta(nodes[2].position, nodes[0].position)).toEqual({ x: 680, y: 0 });
        expect(delta(nodes[3].position, nodes[0].position)).toEqual({ x: 0, y: 260 });
    });

    it("marks every node as successfully generated", () => {
        const nodes = buildFissionNodes(variants, { x: 0, y: 0 });
        expect(nodes.every((node) => node.metadata?.status === "success")).toBe(true);
    });
});
