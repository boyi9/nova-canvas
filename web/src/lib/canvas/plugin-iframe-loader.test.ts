// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setPluginPermission, isCapabilityGranted } from "@/lib/canvas/iframe-sandbox";
import { createIframeSandbox } from "@/lib/canvas/iframe-sandbox-host";
import { useSandboxPanelStore } from "@/stores/canvas/use-sandbox-panel-store";
import * as nodeRegistry from "@/lib/canvas/node-registry";
import { usePluginStore } from "@/stores/canvas/use-plugin-store";
import {
    deactivateIframePlugin,
    getIframePlugin,
    loadIframePluginFromUrl,
    setIframeHostBridge,
    subscribeAllPluginEvents,
    getIframePlugin,
    type IframeHostBridge,
} from "@/lib/canvas/plugin-iframe-loader";

// The real sandbox needs a real iframe + postMessage; mock it so we can drive onRequest/onMessage directly.
const fakeSandbox = {
    iframe: {} as HTMLIFrameElement,
    call: vi.fn(),
    on: vi.fn(() => () => {}),
    emit: vi.fn(),
    destroy: vi.fn(),
    isReady: () => true,
};
let capturedOnRequest: ((msg: { id: string; method: string; payload?: unknown }) => Promise<unknown>) | null = null;
let capturedOnMessage: ((method: string, payload: unknown) => void) | null = null;
let capturedOnReady: (() => void) | null = null;

vi.mock("@/lib/canvas/iframe-sandbox-host", () => ({
    createIframeSandbox: vi.fn((opts: {
        onRequest?: (msg: { id: string; method: string; payload?: unknown }) => Promise<unknown>;
        onMessage?: (method: string, payload: unknown) => void;
        onReady?: () => void;
    }) => {
        capturedOnRequest = opts.onRequest ?? null;
        capturedOnMessage = opts.onMessage ?? null;
        capturedOnReady = opts.onReady ?? null;
        return fakeSandbox as unknown as ReturnType<typeof createIframeSandbox>;
    }),
    createPluginIframeHTML: vi.fn(() => ""),
}));

const envelope = {
    plugin: {
        id: "sandbox-sample",
        name: "Sandbox Sample",
        version: "0.1.0",
        description: "demo",
        capabilities: ["canvas:read", "ai:generate", "ui:render"],
    },
    source: "console.log('hi from sandbox');",
};

function mockFetch() {
    return vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(envelope) })) as unknown as typeof fetch;
}

const emptyBridge: IframeHostBridge = {
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
        listModels: vi.fn(() => []),
        defaultModel: vi.fn(() => "m"),
    },
};

beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch());
    window.confirm = vi.fn(() => false) as unknown as typeof window.confirm;
    capturedOnRequest = null;
    capturedOnMessage = null;
    capturedOnReady = null;
    setIframeHostBridge(emptyBridge);
    vi.spyOn(nodeRegistry, "registerNodeDefinitions").mockImplementation(() => {});
    vi.spyOn(nodeRegistry, "unregisterPluginNodes").mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    setIframeHostBridge(null);
    deactivateIframePlugin("sandbox-sample");
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe("iframe sandbox plugin loader", () => {
    it("loads a JSON envelope and registers the plugin", async () => {
        const instance = await loadIframePluginFromUrl("http://localhost/plugins/sandbox-sample.json");
        expect(instance.id).toBe("sandbox-sample");
        expect(getIframePlugin("sandbox-sample")?.id).toBe("sandbox-sample");
        expect(nodeRegistry.registerNodeDefinitions).toHaveBeenCalledWith([], "sandbox-sample");
        expect(usePluginStore.getState().plugins.some((p) => p.id === "sandbox-sample")).toBe(true);
        expect(capturedOnRequest).toBeTypeOf("function");
    });

    it("denies a method whose capability is not declared in the manifest", async () => {
        await loadIframePluginFromUrl("http://localhost/plugins/sandbox-sample.json");
        // applyOps maps to canvas:write, which is NOT in the manifest capabilities.
        await expect(capturedOnRequest!({ id: "1", method: "applyOps", payload: { ops: [] } })).rejects.toThrow(/Permission denied/);
    });

    it("routes a declared capability to the host bridge", async () => {
        await loadIframePluginFromUrl("http://localhost/plugins/sandbox-sample.json");
        const node = { id: "n1", title: "t" };
        (emptyBridge.getNode as ReturnType<typeof vi.fn>).mockResolvedValueOnce(node);
        const result = await capturedOnRequest!({ id: "2", method: "getNode", payload: { id: "n1" } });
        expect(result).toEqual(node);
    });

    it("requires and honors the ai:generate permission", async () => {
        await loadIframePluginFromUrl("http://localhost/plugins/sandbox-sample.json");
        // Without granting, requestCapability shows a confirm (stubbed to false) -> denied.
        await expect(capturedOnRequest!({ id: "3", method: "ai.generateImage", payload: { prompt: "x" } })).rejects.toThrow(/Permission denied/);

        setPluginPermission("sandbox-sample", "ai:generate", true);
        const res = await capturedOnRequest!({ id: "4", method: "ai.generateImage", payload: { prompt: "x" } });
        expect(res).toEqual({ images: ["data:img"] });
    });

    it("deactivates and unregisters the plugin", async () => {
        await loadIframePluginFromUrl("http://localhost/plugins/sandbox-sample.json");
        deactivateIframePlugin("sandbox-sample");
        expect(getIframePlugin("sandbox-sample")).toBeUndefined();
        expect(nodeRegistry.unregisterPluginNodes).toHaveBeenCalledWith("sandbox-sample");
    });

    it("forwards iframe -> host events (incl. iframe:ready) to subscribers", async () => {
        const received: Array<{ pluginId: string; type: string }> = [];
        const unsub = subscribeAllPluginEvents((pluginId, ev) => received.push({ pluginId, type: ev.type }));
        await loadIframePluginFromUrl("http://localhost/plugins/sandbox-sample.json");
        expect(capturedOnMessage).toBeTypeOf("function");
        expect(capturedOnReady).toBeTypeOf("function");
        capturedOnReady!();
        capturedOnMessage!("sample:done", { ok: true, summary: "done" });
        expect(received).toContainEqual({ pluginId: "sandbox-sample", type: "iframe:ready" });
        expect(received).toContainEqual({ pluginId: "sandbox-sample", type: "sample:done" });
        unsub();
    });

    it("renders a declarative panel via the ui:render capability and clears it", async () => {
        await loadIframePluginFromUrl("http://localhost/plugins/sandbox-sample.json");
        useSandboxPanelStore.getState().clearAll();
        await capturedOnRequest!({ id: "9", method: "renderPanel", payload: { title: "hi", status: "done" } });
        expect(useSandboxPanelStore.getState().panels["sandbox-sample"]?.title).toBe("hi");
        await capturedOnRequest!({ id: "10", method: "clearPanel", payload: {} });
        expect(useSandboxPanelStore.getState().panels["sandbox-sample"]).toBeUndefined();
    });

    it("denies renderPanel when ui:render is not declared", async () => {
        // 用一份未声明 ui:render 的信封验证权限拒绝。
        const strictEnvelope = JSON.stringify({ plugin: { id: "no-ui", name: "no-ui", version: "0.1.0", capabilities: ["canvas:read"] }, source: "console.log(1)" });
        vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, text: async () => strictEnvelope } as unknown as Response);
        await loadIframePluginFromUrl("http://localhost/no-ui.json");
        await expect(capturedOnRequest!({ id: "11", method: "renderPanel", payload: { title: "x" } })).rejects.toThrow(/Permission denied/);
    });
});
