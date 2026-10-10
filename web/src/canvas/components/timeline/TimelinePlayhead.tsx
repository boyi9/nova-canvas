import { cn } from "@/lib/utils";
import { formatTime } from "./timelineTypes";

interface TimelinePlayheadProps {
  position: number;
  zoomLevel: number;
  scrollX: number;
  duration: number;
  height: number;
  /** React 19：ref 作为普通 prop 传入 */
  ref?: React.RefObject<HTMLDivElement | null>;
}

export function TimelinePlayhead({
  position,
  zoomLevel,
  scrollX,
  duration,
  height,
}: TimelinePlayheadProps) {
  const x = position * zoomLevel - scrollX;

  // 如果播放头不在可视区域内，不渲染
  if (x < -10 || x > (typeof window !== "undefined" ? window.innerWidth : 1920) + 10) {
    return null;
  }

  return (
    <>
      {/* 播放头线 */}
      <div
        className="absolute top-10 bottom-0 w-px bg-red-500 pointer-events-none z-20"
        style={{ left: x, transform: `translateX(-50%)` }}
      >
        {/* 顶部三角标记 */}
        <div
          className="absolute -top-2 w-0 h-0 border-l-3 border-r-3 border-b-4 border-transparent border-b-red-500"
          style={{ left: "50%", transform: "translateX(-50%)" }}
        />
        {/* 底部三角标记 */}
        <div
          className="absolute bottom-0 w-0 h-0 border-l-3 border-r-3 border-t-4 border-transparent border-t-red-500"
          style={{ left: "50%", transform: "translateX(-50%)" }}
        />
      </div>

      {/* 时间标签 */}
      <div
        className="absolute top-10 left-0 transform -translate-x-1/2 bg-red-500 text-foreground text-[10px] px-1.5 py-0.5 rounded font-mono whitespace-nowrap z-30"
        style={{ left: x }}
      >
        {formatTime(position, 30)}
      </div>

      {/* 循环区域标记（可选） */}
      {/* 可以在这里添加 In/Out 点标记 */}
    </>
  );
}