import { create } from "zustand";

import type { SandboxPanelView } from "@/types/canvas-plugin";

// 沙箱插件推送的声明式面板，按 pluginId 存储，由宿主 UI 渲染。
type SandboxPanelState = {
    panels: Record<string, SandboxPanelView>;
    setPanel: (pluginId: string, view: SandboxPanelView) => void;
    clearPanel: (pluginId: string) => void;
    clearAll: () => void;
};

export const useSandboxPanelStore = create<SandboxPanelState>((set) => ({
    panels: {},
    setPanel: (pluginId, view) =>
        set((state) => ({ panels: { ...state.panels, [pluginId]: view } })),
    clearPanel: (pluginId) =>
        set((state) => {
            const next = { ...state.panels };
            delete next[pluginId];
            return { panels: next };
        }),
    clearAll: () => set({ panels: {} }),
}));
