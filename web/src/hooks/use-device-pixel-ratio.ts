import { useEffect, useState } from "react";

import { getDevicePixelRatio, normalizeDevicePixelRatio } from "@/lib/canvas/dpr";

/**
 * 跟踪当前窗口的 devicePixelRatio。
 *
 * 浏览器缩放、窗口拖到另一块屏幕、系统缩放比例变化都会改变 dpr。
 * 媒体查询 `(resolution: Ndppx)` 能捕获这些变化；`resize` 作为兜底，
 * 覆盖不支持 resolution 查询或改变了窗口但 dpr 未变的情况。
 */
export function useDevicePixelRatio(): number {
    const [dpr, setDpr] = useState(() => getDevicePixelRatio());

    useEffect(() => {
        if (typeof window === "undefined") return;

        const update = () => {
            const next = getDevicePixelRatio();
            setDpr((current) => (current === next ? current : next));
        };

        window.addEventListener("resize", update);

        let mediaQuery: MediaQueryList | null = null;
        const handleMediaChange = () => update();
        if (typeof window.matchMedia === "function") {
            mediaQuery = window.matchMedia(`(resolution: ${normalizeDevicePixelRatio(dpr)}dppx)`);
            mediaQuery.addEventListener?.("change", handleMediaChange);
        }

        return () => {
            window.removeEventListener("resize", update);
            mediaQuery?.removeEventListener?.("change", handleMediaChange);
        };
    }, [dpr]);

    return dpr;
}
