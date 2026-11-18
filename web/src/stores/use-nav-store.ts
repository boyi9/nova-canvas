import { create } from "zustand";
import { persist } from "zustand/middleware";

type NavStore = {
    sidebarCollapsed: boolean;
    setSidebarCollapsed: (collapsed: boolean) => void;
    toggleSidebar: () => void;
};

/**
 * 工作台导航状态。
 * 折叠状态持久化到 localStorage，刷新后保持用户选择。
 */
export const useNavStore = create<NavStore>()(
    persist(
        (set) => ({
            sidebarCollapsed: false,
            setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
            toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
        }),
        { name: "nova-canvas:nav_store" },
    ),
);
