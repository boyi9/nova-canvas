// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as iframeLoader from "@/lib/canvas/plugin-iframe-loader";
import * as pluginLoader from "@/lib/canvas/plugin-loader";
import { usePluginStore } from "@/stores/canvas/use-plugin-store";

type InstalledPlugin = pluginLoader.InstalledPlugin;

// 避免真实 iframe 副作用；createIframeSandbox 返回占位沙箱。
vi.mock("@/lib/canvas/iframe-sandbox-host", () => ({
    createIframeSandbox: vi.fn(() => ({
        iframe: {} as HTMLIFrameElement,
        call: vi.fn(),
        on: vi.fn(() => () => {}),
        emit: vi.fn(),
        destroy: vi.fn(),
        isReady: () => true,
    })),
    createPluginIframeHTML: vi.fn(() => ""),
}));

const sandboxRecord = (id: string, enabled: boolean): InstalledPlugin => ({
    id,
    name: id,
    version: "1.0.0",
    url: `http://localhost/${id}.json`,
    source: "console.log('untrusted');",
    enabled,
    sandbox: true,
    manifest: { id, name: id, version: "1.0.0", capabilities: ["canvas:read"] },
});

beforeEach(() => {
    vi.restoreAllMocks();
    usePluginStore.setState({ plugins: [] });
    localStorage.clear();
    // 让 ensurePluginsLoaded 的 rehydrate 成为空操作，避免持久化覆盖内存中的测试记录。
    vi.spyOn(usePluginStore.persist, "rehydrate").mockResolvedValue(undefined);
});

describe("sandbox plugin persistence/restore", () => {
    it("restores a sandbox plugin via the iframe (never eval'ing untrusted source)", async () => {
        const spiedIframe = vi.spyOn(iframeLoader, "activateIframePlugin");
        const spiedNode = vi.spyOn(pluginLoader, "activatePlugin");
        usePluginStore.getState().upsert(sandboxRecord("sb", true));

        await pluginLoader.ensurePluginsLoaded();

        expect(spiedIframe).toHaveBeenCalledWith(expect.objectContaining({ id: "sb" }), "console.log('untrusted');", undefined);
        // 关键安全属性：沙箱插件绝不会走主上下文 eval 路径。
        expect(spiedNode).not.toHaveBeenCalledWith(expect.objectContaining({ id: "sb" }));
        expect(iframeLoader.getIframePlugin("sb")).toBeDefined();
    });

    it("setPluginEnabled toggles the sandbox iframe without eval", async () => {
        const spiedIframe = vi.spyOn(iframeLoader, "activateIframePlugin");
        const spiedDeactivate = vi.spyOn(iframeLoader, "deactivateIframePlugin");

        await pluginLoader.setPluginEnabled(sandboxRecord("sb2", false), true);
        expect(spiedIframe).toHaveBeenCalledWith(expect.objectContaining({ id: "sb2" }), "console.log('untrusted');", undefined);

        await pluginLoader.setPluginEnabled({ ...sandboxRecord("sb2", true) }, false);
        expect(spiedDeactivate).toHaveBeenCalledWith("sb2");
    });

    it("uninstallPlugin tears down the sandbox iframe", () => {
        const spiedDeactivate = vi.spyOn(iframeLoader, "deactivateIframePlugin");
        usePluginStore.getState().upsert(sandboxRecord("sb3", true));

        pluginLoader.uninstallPlugin("sb3");

        expect(spiedDeactivate).toHaveBeenCalledWith("sb3");
        expect(usePluginStore.getState().plugins.some((p) => p.id === "sb3")).toBe(false);
    });
});
