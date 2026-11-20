import React, { useCallback, useEffect, useRef, useState } from "react";

import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { snapToDevicePixel } from "@/lib/canvas/dpr";
import { normalizeWheelDelta, panViewportBy, wheelZoomFactor, zoomAtScreenPoint } from "@/lib/canvas/viewport";
import { useDevicePixelRatio } from "@/hooks/use-device-pixel-ratio";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ViewportTransform } from "@/types/canvas";

type NovaCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    tool: "select" | "pan";
    backgroundMode?: CanvasBackgroundMode;
    onViewportChange: (viewport: ViewportTransform) => void;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onCanvasDeselect?: () => void;
    onCanvasDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onContextMenu?: (event: React.MouseEvent) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
};

export function NovaCanvas({ containerRef, viewport, tool, backgroundMode = "lines", onViewportChange, onCanvasMouseDown, onCanvasDeselect, onCanvasDoubleClick, onContextMenu, onDrop, children }: NovaCanvasProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    // 网格线按设备像素对齐，避免高分屏上 1px 线落在半像素处发虚。
    const dpr = useDevicePixelRatio();
    const panState = useRef<{
        isPanning: boolean;
        startX: number;
        startY: number;
        initialViewport: ViewportTransform;
        hasMoved: boolean;
        startedOnBackground: boolean;
    }>({
        isPanning: false,
        startX: 0,
        startY: 0,
        initialViewport: viewport,
        hasMoved: false,
        startedOnBackground: false,
    });
    // 连续滚轮/平移事件可能在同一帧内多次触发，props 里的 viewport 尚未回写；
    // 这里同步保存最近一次对外发出的视口，保证每次增量都基于最新值累加。
    const latestViewportRef = useRef(viewport);
    const callbacksRef = useRef({ onViewportChange, onCanvasDeselect });
    const frameRef = useRef<number | null>(null);
    const nextViewportRef = useRef<ViewportTransform | null>(null);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [isControlPressed, setIsControlPressed] = useState(false);
    const [isPanning, setIsPanning] = useState(false);

    useEffect(() => {
        latestViewportRef.current = viewport;
    }, [viewport]);

    useEffect(() => {
        callbacksRef.current = { onViewportChange, onCanvasDeselect };
    }, [onCanvasDeselect, onViewportChange]);

    const emitViewport = useCallback((next: ViewportTransform) => {
        latestViewportRef.current = next;
        callbacksRef.current.onViewportChange(next);
    }, []);

    useEffect(
        () => () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        },
        [],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Control") setIsControlPressed(true);
            if (event.code !== "Space") return;
            const target = event.target instanceof Element ? event.target : null;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true']")) return;
            event.preventDefault();
            setIsSpacePressed(true);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code === "Space") {
                const target = event.target instanceof Element ? event.target : null;
                if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true']"))) event.preventDefault();
                setIsSpacePressed(false);
            }
            if (event.key === "Control") setIsControlPressed(false);
        };

        const handleBlur = () => {
            setIsSpacePressed(false);
            setIsControlPressed(false);
            panState.current.isPanning = false;
            setIsPanning(false);
            document.body.style.cursor = "";
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", handleBlur);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", handleBlur);
        };
    }, []);

    const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown")) return;

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        // 以鼠标位置为锚点缩放：光标下的世界坐标保持不动，缩放不会“跑偏”。
        // deltaMode 归一化后，Firefox 行模式（±3 行）与触控板/鼠标的像素模式手感一致。
        const delta = normalizeWheelDelta(event.deltaY, event.deltaMode);
        if (delta === 0) return;
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        emitViewport(zoomAtScreenPoint(latestViewportRef.current, mouseX, mouseY, wheelZoomFactor(delta)));
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom]")) return;
        if (target?.closest("[data-connection-create-menu]")) return;
        const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id]");
        const temporaryTool = event.ctrlKey || isSpacePressed;
        const activeTool = temporaryTool ? (tool === "select" ? "pan" : "select") : tool;
        const shouldPan = event.button === 1 || (event.button === 0 && activeTool === "pan");

        if (shouldPan) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            panState.current = {
                isPanning: true,
                startX: event.clientX,
                startY: event.clientY,
                initialViewport: latestViewportRef.current,
                hasMoved: false,
                startedOnBackground: isBackgroundClick,
            };
            setIsPanning(true);
            document.body.style.cursor = "grabbing";
            return;
        }

        if (event.button === 0 && isBackgroundClick) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onCanvasMouseDown?.(event);
        }
    };

    const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom],[data-node-id],[data-connection-id]")) return;
        onCanvasDoubleClick?.(event);
    };

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!panState.current.isPanning) return;

            const dx = event.clientX - panState.current.startX;
            const dy = event.clientY - panState.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                panState.current.hasMoved = true;
            }

            // 平移只改 x/y：以按下时的视口为基准，避免缩放并发时累积误差。
            nextViewportRef.current = panViewportBy(panState.current.initialViewport, dx, dy);
            if (frameRef.current) return;
            frameRef.current = requestAnimationFrame(() => {
                frameRef.current = null;
                const next = nextViewportRef.current;
                nextViewportRef.current = null;
                if (next) emitViewport(next);
            });
        };

        const handlePointerUp = () => {
            if (!panState.current.isPanning) return;

            // 收尾时把尚未提交的最后一帧补发，快速拖拽不会丢失最后几像素。
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
            if (nextViewportRef.current) {
                emitViewport(nextViewportRef.current);
                nextViewportRef.current = null;
            }

            if (!panState.current.hasMoved && panState.current.startedOnBackground) {
                callbacksRef.current.onCanvasDeselect?.();
            }
            panState.current.isPanning = false;
            setIsPanning(false);
            document.body.style.cursor = "";
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
            document.body.style.cursor = "";
        };
    }, [emitViewport]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Prevent canvas scrolling from moving the page while preserving native scrolling inside overlays and dialogs.
        const preventWheelScroll = (event: WheelEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest("[data-canvas-no-zoom],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown")) return;
            event.preventDefault();
        };
        container.addEventListener("wheel", preventWheelScroll, { passive: false });
        return () => container.removeEventListener("wheel", preventWheelScroll);
    }, [containerRef]);

    const temporaryTool = isControlPressed || isSpacePressed;
    const activeTool = temporaryTool ? (tool === "select" ? "pan" : "select") : tool;
    const cursor = isPanning ? "grabbing" : activeTool === "pan" ? "grab" : undefined;

    return (
        <div
            ref={containerRef}
            data-testid="canvas-container"
            className="relative h-full w-full select-none overflow-clip"
            style={{ background: theme.canvas.background, cursor }}
            onPointerDown={handlePointerDown}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
            onContextMenu={onContextMenu}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
        >
            <CanvasGrid viewport={viewport} mode={backgroundMode} dpr={dpr} />
            <div
                data-testid="canvas-world-layer"
                data-viewport-x={viewport.x}
                data-viewport-y={viewport.y}
                data-viewport-k={viewport.k}
                className="absolute origin-top-left"
                style={{
                    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`,
                }}
            >
                {children}
            </div>
        </div>
    );
}

function CanvasGrid({ viewport, mode, dpr }: { viewport: ViewportTransform; mode: CanvasBackgroundMode; dpr: number }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (mode === "blank") return null;

    // 网格间距与偏移都对齐到设备像素：缩放比例是连续值时，
    // 未对齐会让 1px 网格线覆盖在两个像素之间，出现灰边/摩尔纹。
    const gridSize = snapToDevicePixel(48 * viewport.k, dpr);
    if (!(gridSize > 0)) return null;

    const x = snapToDevicePixel(viewport.x % gridSize, dpr);
    const y = snapToDevicePixel(viewport.y % gridSize, dpr);
    const dotSize = viewport.k < 0.12 ? 0.8 : 1.15;
    const backgroundImage =
        mode === "dots" ? `radial-gradient(circle, ${theme.canvas.dot} ${dotSize}px, transparent ${dotSize + 0.2}px)` : `linear-gradient(${theme.canvas.line} 1px, transparent 1px), linear-gradient(90deg, ${theme.canvas.line} 1px, transparent 1px)`;

    return (
        <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
                backgroundImage,
                backgroundSize: `${gridSize}px ${gridSize}px`,
                backgroundPosition: `${x}px ${y}px`,
            }}
        />
    );
}
