/**
 * DPI / 设备像素比工具。
 *
 * 画布容器有两套尺寸，不能混用：
 * - CSS 像素：布局、命中测试、视口坐标（`ViewportTransform`）都使用它；
 * - 位图尺寸：`<canvas>` 的 `width/height` 属性，必须乘以 devicePixelRatio，
 *   否则在高分屏上会被浏览器拉伸导致发虚。
 *
 * 纯计算函数可安全用于测试；`resizeCanvasBackingStore` 是唯一触碰 DOM 的辅助函数。
 */

export type CanvasBackingSize = { width: number; height: number; dpr: number };

/** 读取当前设备像素比；SSR、测试环境或异常值统一回退到 1。 */
export function getDevicePixelRatio(): number {
    if (typeof window === "undefined") return 1;
    return normalizeDevicePixelRatio(window.devicePixelRatio);
}

export function normalizeDevicePixelRatio(dpr: number | null | undefined): number {
    return typeof dpr === "number" && Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
}

function safeCssLength(value: number): number {
    return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 由 CSS 尺寸计算位图缓冲区尺寸。
 * 至少保留 1px，避免容器暂时隐藏时把 canvas 设成 0 而丢失上下文状态。
 */
export function getCanvasBackingSize(cssWidth: number, cssHeight: number, dpr: number = getDevicePixelRatio()): CanvasBackingSize {
    const ratio = normalizeDevicePixelRatio(dpr);
    return {
        width: Math.max(1, Math.round(safeCssLength(cssWidth) * ratio)),
        height: Math.max(1, Math.round(safeCssLength(cssHeight) * ratio)),
        dpr: ratio,
    };
}

/** 把 CSS 像素值对齐到设备像素网格，消除 1px 网格线/描边的半像素模糊。 */
export function snapToDevicePixel(value: number, dpr: number = getDevicePixelRatio()): number {
    if (!Number.isFinite(value)) return 0;
    const ratio = normalizeDevicePixelRatio(dpr);
    return Math.round(value * ratio) / ratio;
}

/**
 * 调整 canvas 位图尺寸并按 DPR 缩放绘制上下文。
 * 注意：给 `canvas.width/height` 赋值会重置变换矩阵，因此 setTransform 必须放在最后。
 */
export function resizeCanvasBackingStore(canvas: HTMLCanvasElement | null | undefined, cssWidth: number, cssHeight: number, dpr: number = getDevicePixelRatio()): CanvasBackingSize {
    const ratio = normalizeDevicePixelRatio(dpr);
    const backing = getCanvasBackingSize(cssWidth, cssHeight, ratio);
    if (!canvas) return backing;

    if (canvas.width !== backing.width) canvas.width = backing.width;
    if (canvas.height !== backing.height) canvas.height = backing.height;

    const cssW = safeCssLength(cssWidth);
    const cssH = safeCssLength(cssHeight);
    if (cssW > 0) canvas.style.width = `${cssW}px`;
    if (cssH > 0) canvas.style.height = `${cssH}px`;

    const context = canvas.getContext("2d");
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    return backing;
}
