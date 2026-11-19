/**
 * 画布视口数学（纯函数，不依赖 DOM）。
 *
 * 坐标系约定：
 * - 世界坐标（world）：画布内容坐标，原点固定，单位与节点尺寸一致，可无限延伸；
 * - 屏幕坐标（screen）：画布容器左上角为原点的 CSS 像素坐标；
 * - 变换关系：`screen = world * k + (x, y)`，其中 `viewport.x/y` 是屏幕平移量，`k` 是缩放比例。
 *
 * 所有函数只接收数值并返回新对象，不修改入参，便于单测与在动画/拖拽中复用。
 */

import type { Position, ViewportTransform } from "@/types/canvas";

export type CanvasSize = { width: number; height: number };
export type CanvasRect = { x: number; y: number; width: number; height: number };
export type ClientRectLike = { left: number; top: number };

/** 缩放下限：再小节点就只剩色块，且网格计算开始失真。 */
export const MIN_ZOOM = 0.05;
/** 缩放上限：超过 5 倍后节点内容（图片/文本）已无有效信息。 */
export const MAX_ZOOM = 5;
export const DEFAULT_ZOOM = 1;
/** 滚轮每 100 deltaY 对应约 1.1 倍缩放，接近触控板与鼠标滚轮的共同手感。 */
export const WHEEL_ZOOM_BASE = 1.1;

const FALLBACK_VIEWPORT: ViewportTransform = { x: 0, y: 0, k: DEFAULT_ZOOM };

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function safeSize(size: Partial<CanvasSize> | null | undefined): CanvasSize {
    return {
        width: isFiniteNumber(size?.width) && size.width > 0 ? size.width : 0,
        height: isFiniteNumber(size?.height) && size.height > 0 ? size.height : 0,
    };
}

/**
 * 夹取缩放比例，并兜底非数字输入。
 * `min`/`max` 允许调用方传入更窄的区间（例如聚焦节点时最高锁定到 1）。
 */
export function clampZoom(zoom: number, min: number = MIN_ZOOM, max: number = MAX_ZOOM): number {
    if (!isFiniteNumber(zoom)) return DEFAULT_ZOOM;
    const lower = isFiniteNumber(min) && min > 0 ? min : MIN_ZOOM;
    const upper = isFiniteNumber(max) && max >= lower ? max : lower;
    return Math.min(Math.max(zoom, lower), upper);
}

/**
 * 校验并修复持久化/导入的视口数据。
 * 非有限数值的字段回退到 fallback（默认世界原点、100% 缩放）。
 */
export function sanitizeViewport(view: Partial<ViewportTransform> | null | undefined, fallback: ViewportTransform = FALLBACK_VIEWPORT): ViewportTransform {
    const base = isFiniteNumber(fallback?.x) && isFiniteNumber(fallback?.y) && isFiniteNumber(fallback?.k) ? fallback : FALLBACK_VIEWPORT;
    if (!view || typeof view !== "object") {
        return { x: base.x, y: base.y, k: clampZoom(base.k) };
    }
    return {
        x: isFiniteNumber(view.x) ? view.x : base.x,
        y: isFiniteNumber(view.y) ? view.y : base.y,
        k: clampZoom(isFiniteNumber(view.k) ? view.k : base.k),
    };
}

/**
 * 旧数据把 `{ x: 0, y: 0, k: 1 }` 当作默认值，语义是“尚未设置视口”。
 * 新建/导入项目沿用它，加载时应改为把世界原点放到容器中心。
 */
export function isUntouchedViewport(view: ViewportTransform | null | undefined): boolean {
    if (!view) return true;
    return Math.abs(view.x) < 1e-6 && Math.abs(view.y) < 1e-6 && Math.abs(view.k - DEFAULT_ZOOM) < 1e-6;
}

/** 世界原点位于容器中心，缩放为 1；容器尺寸未知时退化为左上角。 */
export function createInitialViewport(width: number, height: number, zoom: number = DEFAULT_ZOOM): ViewportTransform {
    const size = safeSize({ width, height });
    return { x: size.width / 2, y: size.height / 2, k: clampZoom(zoom) };
}

export function screenToWorld(viewport: ViewportTransform, point: Position): Position {
    return {
        x: (point.x - viewport.x) / viewport.k,
        y: (point.y - viewport.y) / viewport.k,
    };
}

export function worldToScreen(viewport: ViewportTransform, point: Position): Position {
    return {
        x: point.x * viewport.k + viewport.x,
        y: point.y * viewport.k + viewport.y,
    };
}

/** 把浏览器 client 坐标（含滚动/容器偏移）换算成世界坐标。 */
export function clientToWorld(viewport: ViewportTransform, clientX: number, clientY: number, rect: ClientRectLike | null | undefined): Position {
    return screenToWorld(viewport, {
        x: clientX - (isFiniteNumber(rect?.left) ? rect.left : 0),
        y: clientY - (isFiniteNumber(rect?.top) ? rect.top : 0),
    });
}

/** 以容器内某个屏幕点为锚点缩放，锚点下的世界坐标保持不动。 */
export function setZoomAtScreenPoint(viewport: ViewportTransform, screenX: number, screenY: number, zoom: number): ViewportTransform {
    const nextZoom = clampZoom(zoom);
    const anchor = screenToWorld(viewport, { x: screenX, y: screenY });
    return {
        x: screenX - anchor.x * nextZoom,
        y: screenY - anchor.y * nextZoom,
        k: nextZoom,
    };
}

/** 相对缩放：factor 为倍数（1 表示不变）。 */
export function zoomAtScreenPoint(viewport: ViewportTransform, screenX: number, screenY: number, factor: number): ViewportTransform {
    if (!isFiniteNumber(factor) || factor <= 0) return { ...viewport };
    return setZoomAtScreenPoint(viewport, screenX, screenY, viewport.k * factor);
}

/** 把 wheel 的 deltaY 转成缩放倍数：向上滚（deltaY < 0）放大。 */
export function wheelZoomFactor(deltaY: number): number {
    if (!isFiniteNumber(deltaY) || deltaY === 0) return 1;
    return Math.pow(WHEEL_ZOOM_BASE, -deltaY / 100);
}

export function panViewportBy(viewport: ViewportTransform, dx: number, dy: number): ViewportTransform {
    return {
        x: viewport.x + (isFiniteNumber(dx) ? dx : 0),
        y: viewport.y + (isFiniteNumber(dy) ? dy : 0),
        k: viewport.k,
    };
}

/**
 * 当前视口可见的世界矩形。`padding` 为世界单位的外扩量，
 * 用于提前渲染临近视口的节点，避免拖拽时边缘闪白。
 */
export function getVisibleWorldRect(viewport: ViewportTransform, size: CanvasSize, padding = 0): CanvasRect {
    const { width, height } = safeSize(size);
    const pad = isFiniteNumber(padding) && padding > 0 ? padding : 0;
    const topLeft = screenToWorld(viewport, { x: 0, y: 0 });
    const bottomRight = screenToWorld(viewport, { x: width, y: height });
    return {
        x: topLeft.x - pad,
        y: topLeft.y - pad,
        width: Math.max(bottomRight.x - topLeft.x, 0) + pad * 2,
        height: Math.max(bottomRight.y - topLeft.y, 0) + pad * 2,
    };
}

/** 容器中心对应的世界坐标，用于“围绕中心缩放/适配”。 */
export function getWorldViewportCenter(viewport: ViewportTransform, size: CanvasSize): Position {
    const { width, height } = safeSize(size);
    return screenToWorld(viewport, { x: width / 2, y: height / 2 });
}

/** 平移视口，使指定世界坐标落在容器中心，保持缩放不变。 */
export function centerViewportOnWorld(viewport: ViewportTransform, size: CanvasSize, world: Position): ViewportTransform {
    const { width, height } = safeSize(size);
    const zoom = clampZoom(viewport.k);
    return {
        x: width / 2 - world.x * zoom,
        y: height / 2 - world.y * zoom,
        k: zoom,
    };
}

export type FitViewportOptions = {
    /** 屏幕像素内边距（四周相同）。 */
    padding?: number;
    /** 按容器尺寸比例留白，例如 0.2 表示每侧留 20%，可用区域为 60%。优先于 padding。 */
    paddingRatio?: number;
    minZoom?: number;
    maxZoom?: number;
};

/**
 * 让世界矩形完整落入视口并居中。
 * 边界非法（宽高为 0、非有限数值）时回退到初始视口，避免出现 NaN 变换。
 */
export function fitViewportToBounds(bounds: Partial<CanvasRect> | null | undefined, size: CanvasSize, options: FitViewportOptions = {}): ViewportTransform {
    const { width, height } = safeSize(size);
    const minZoom = options.minZoom ?? MIN_ZOOM;
    const maxZoom = options.maxZoom ?? MAX_ZOOM;
    const boundsWidth = isFiniteNumber(bounds?.width) ? Math.abs(bounds.width) : 0;
    const boundsHeight = isFiniteNumber(bounds?.height) ? Math.abs(bounds.height) : 0;

    if (!bounds || !isFiniteNumber(bounds.x) || !isFiniteNumber(bounds.y) || boundsWidth <= 0 || boundsHeight <= 0 || width <= 0 || height <= 0) {
        return createInitialViewport(width, height, clampZoom(DEFAULT_ZOOM, minZoom, maxZoom));
    }

    const padding = isFiniteNumber(options.padding) && options.padding > 0 ? options.padding : 0;
    const paddingRatio = isFiniteNumber(options.paddingRatio) && options.paddingRatio > 0 ? Math.min(options.paddingRatio, 0.49) : 0;
    const horizontalInset = paddingRatio > 0 ? width * paddingRatio : padding;
    const verticalInset = paddingRatio > 0 ? height * paddingRatio : padding;
    const availableWidth = Math.max(width - horizontalInset * 2, 1);
    const availableHeight = Math.max(height - verticalInset * 2, 1);
    const zoom = clampZoom(Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight), minZoom, maxZoom);

    return {
        x: width / 2 - (bounds.x + boundsWidth / 2) * zoom,
        y: height / 2 - (bounds.y + boundsHeight / 2) * zoom,
        k: zoom,
    };
}

/**
 * 容器尺寸变化时保持视口中心的世界坐标不变。
 * 侧边栏折叠、窗口缩放、分屏切换都会触发，避免画布内容整体漂移。
 */
export function resizeViewport(viewport: ViewportTransform, previousSize: CanvasSize, nextSize: CanvasSize): ViewportTransform {
    const previous = safeSize(previousSize);
    const next = safeSize(nextSize);
    if (next.width <= 0 || next.height <= 0) return { ...viewport };
    if (previous.width <= 0 || previous.height <= 0) return createInitialViewport(next.width, next.height, viewport.k);
    return centerViewportOnWorld(viewport, next, getWorldViewportCenter(viewport, previous));
}
