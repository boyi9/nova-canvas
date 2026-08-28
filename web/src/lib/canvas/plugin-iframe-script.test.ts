// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as iframeLoader from "@/lib/canvas/plugin-iframe-loader";
import { usePluginStore } from "@/stores/canvas/use-plugin-store";

vi.mock("@/lib/canvas/iframe-sandbox-host", () => ({
    createIframeSandbox: vi.fn((opts: { onRequest?: (msg: { id: string; method: string; payload?: unknown }) => Promise<unknown> }) => {
        capturedOnRequest = opts.onRequest ?? null;
        return fakeSandbox as unknown as ReturnType<typeof import("@/lib/canvas/iframe-sandbox-host").createIframeSandbox>;
    }),
    createPluginIframeHTML: vi.fn(() => ""),
}));

let capturedOnRequest: ((msg: { id: string; method: string; payload?: unknown }) => Promise<unknown>) | null = null;
const fakeSandbox = {
    iframe: {} as HTMLIFrameElement,
    call: vi.fn(),
    on: vi.fn(() => () => {}),
    emit: vi.fn(),
    destroy: vi.fn(),
    isReady: () => true,
};

const bridge = {
    getNode: vi.fn(async () => null),
    getNodes: vi.fn(async () => []),
    getConnections: vi.fn(async () => []),
    getUpstream: vi.fn(async () => []),
    getDownstream: vi.fn(async () => []),
    updateNode: vi.fn(async () => {}),
    updateMetadata: vi.fn(async () => {}),
    applyOps: vi.fn(async () => {}),
    ai: {
        generateImage: vi.fn(async () => ({ images: ["data:img"] })),
        generateVideo: vi.fn(async () => ({ url: "x" })),
        generateText: vi.fn(async () => ({ text: "t" })),
        listModels: vi.fn(async () => []),
        defaultModel: vi.fn(async () => "m"),
    },
};

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => "console.log('hi');" })) as unknown as typeof fetch);
    window.confirm = vi.fn(() => true) as unknown as typeof window.confirm;
    usePluginStore.setState({ plugins: [] });
    iframeLoader.setIframeHostBridge(bridge as never);
});

describe("iframe script runner", () => {
    it("runs a script as a sandbox plugin with empty nodes and default capabilities", async () => {
        const inst = await iframeLoader.runIframeScript({ id: "script:demo", name: "Demo", source: "console.log('x');" });
        expect(inst.id).toBe("script:demo");
        const record = usePluginStore.getState().plugins.find((p) => p.id === "script:demo");
        expect(record).toBeTruthy();
        expect(record?.sandbox).toBe(true);
        expect(record?.manifest?.nodes).toEqual([]);
        expect(record?.manifest?.capabilities).toContain("ai:generate");
    });

    it("applies default capabilities when none provided", async () => {
        await iframeLoader.runIframeScript({ id: "script:empty", name: "E", source: "x" });
        const record = usePluginStore.getState().plugins.find((p) => p.id === "script:empty");
        expect(record?.manifest?.capabilities).toEqual(["canvas:read", "canvas:write", "ai:generate", "ui:render"]);
    });

    it("routes applyOps through the host bridge", async () => {
        await iframeLoader.runIframeScript({ id: "script:ops", name: "O", source: "x", capabilities: ["canvas:write"] });
        expect(capturedOnRequest).toBeTypeOf("function");
        await expect(
            capturedOnRequest!({ id: "1", method: "applyOps", payload: { ops: [{ type: "add_node", nodeType: "image" }] } }),
        ).resolves.toBeUndefined();
        expect(bridge.applyOps).toHaveBeenCalled();
    });

    it("loads script source from URL", async () => {
        const inst = await iframeLoader.runIframeScriptFromUrl("http://localhost/scripts/demo.js", { name: "Remote" });
        expect(inst.id).toBe("script:Remote");
    });
});
