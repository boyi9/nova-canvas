import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatTime } from "./timelineTypes";

interface TimelineRulerProps {
  duration: number;
  zoomLevel: number;    // px per second
  scrollX: number;
  fps: number;
  playheadPosition: number;
  /** React 19：ref 作为普通 prop 传入 */
  ref?: React.RefObject<HTMLDivElement | null>;
}

export function TimelineRuler({
  duration,
  zoomLevel,
  scrollX,
  fps,
  playheadPosition,
}: TimelineRulerProps) {
  const { majorTicks, minorTicks, labelStep } = useMemo(() => {
    // 根据缩放级别决定刻度密度
    const pxPerSecond = zoomLevel;
    if (pxPerSecond >= 200) return { majorTicks: 1, minorTicks: 10, labelStep: 1 };      // 1秒主刻度，10帧次刻度
    if (pxPerSecond >= 100) return { majorTicks: 1, minorTicks: 5, labelStep: 1 };       // 1秒主刻度，5帧次刻度
    if (pxPerSecond >= 50) return { majorTicks: 2, minorTicks: 5, labelStep: 2 };        // 2秒主刻度
    if (pxPerSecond >= 25) return { majorTicks: 5, minorTicks: 0, labelStep: 5 };        // 5秒主刻度
    if (pxPerSecond >= 10) return { majorTicks: 10, minorTicks: 0, labelStep: 10 };      // 10秒主刻度
    return { majorTicks: 30, minorTicks: 0, labelStep: 30 };                              // 30秒主刻度
  }, [zoomLevel]);

  const containerWidth = typeof window !== "undefined" ? window.innerWidth : 1920;
  const totalWidth = duration * zoomLevel;
  const visibleStart = scrollX / zoomLevel;
  const visibleEnd = visibleStart + (typeof window !== "undefined" ? window.innerWidth : 1920) / zoomLevel;

  // 生成主刻度
  const majorTickCount = Math.ceil(duration / majorTicks);
  const majorTicksArray = Array.from({ length: majorTickCount + 1 }, (_, i) => i * majorTicks);

  // 生成次刻度
  let minorTicksArray: number[] = [];
  if (minorTicks > 0) {
    const minorInterval = majorTicks / minorTicks;
    const minorCount = Math.ceil(duration / minorInterval);
    minorTicksArray = Array.from({ length: minorCount + 1 }, (_, i) => i * minorInterval);
  }

  return (
    <div
      className="absolute top-0 left-0 right-0 h-10 bg-card border-b border-border z-10"
      style={{ transform: `translateX(40px)` }} // 留出轨道头部宽度
    >
      {/* 次刻度 */}
      {minorTicks > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-2 pointer-events-none">
          {minorTicksArray.map((t) => {
            if (t % majorTicks === 0) return null; // 跳过主刻度位置
            const x = t * zoomLevel;
            if (x < 0 || x > totalWidth) return null;
            return (
              <div
                key={t}
                className="absolute w-px h-full bg-muted"
                style={{ left: x }}
              />
            );
          })}
        </div>
      )}

      {/* 主刻度 + 标签 */}
      <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none">
        {majorTicksArray.map((t) => {
          const x = t * zoomLevel;
          if (x < 0 || x > totalWidth) return null;
          return (
            <div
              key={t}
              className="absolute flex flex-col items-center"
              style={{ left: x }}
            >
              <div className="w-px h-6 bg-gray-500" />
              <span className="text-[10px] text-muted-foreground font-mono mt-1 whitespace-nowrap">
                {formatTime(t, 30)}
              </span>
            </div>
          );
        })}
      </div>

      {/* 播放头位置指示器（在标尺上） */}
      <div
        className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
        style={{ left: playheadPosition * zoomLevel }}
      />
      <div
        className="absolute top-0 left-0 transform -translate-x-1/2 bg-red-500 text-foreground text-[10px] px-1 py-0.5 rounded font-mono whitespace-nowrap"
        style={{ left: playheadPosition * zoomLevel }}
      >
        {formatTime(playheadPosition, 30)}
      </div>
    </div>
  );
}