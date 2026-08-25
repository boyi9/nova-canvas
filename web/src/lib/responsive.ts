import { useSyncExternalStore } from "react";

export type LayoutMode = "mobile" | "tablet" | "desktop";

export const BREAKPOINTS = {
    tablet: 640,
    desktop: 1024,
} as const;

export function resolveLayoutMode(width: number): LayoutMode {
    if (width < BREAKPOINTS.tablet) return "mobile";
    if (width < BREAKPOINTS.desktop) return "tablet";
    return "desktop";
}

export function shouldCollapseLabels(width: number): boolean {
    return width < BREAKPOINTS.desktop;
}

function subscribe(query: string, callback: () => void): () => void {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener("change", callback);
    return () => mql.removeEventListener("change", callback);
}

export function useMediaQuery(query: string): boolean {
    const subscribeWith = (callback: () => void) => subscribe(query, callback);
    const getSnapshot = () => {
        if (typeof window === "undefined" || !window.matchMedia) return false;
        return window.matchMedia(query).matches;
    };
    return useSyncExternalStore(subscribeWith, getSnapshot, () => false);
}
