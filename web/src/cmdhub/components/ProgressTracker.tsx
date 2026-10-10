import { Check, CheckCircle2, ClipboardList, Eye, Loader2, Settings, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Stage = "planning" | "executing" | "awaiting_confirmation" | "delivered";

interface StageConfig {
  id: Stage;
  label: string;
  desc: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

const STAGES: StageConfig[] = [
  {
    id: "planning",
    label: "规划中",
    desc: "需求解析 → 任务拆解 → 资源追问",
    icon: ClipboardList,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    id: "executing",
    label: "执行中",
    desc: "分步进度 → 实时日志 → 中间产出",
    icon: Settings,
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
  {
    id: "awaiting_confirmation",
    label: "待确认",
    desc: "人机接缝卡点 → 预览对比 → 修改/确认",
    icon: Eye,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  {
    id: "delivered",
    label: "已交付",
    desc: "源文件导出 → 结果归因 → 复盘入库",
    icon: CheckCircle2,
    color: "text-success",
    bgColor: "bg-success/10",
  },
];

interface ProgressTrackerProps {
  currentStage: Stage;
  progress: number; // 0-100
  subSteps?: { id: string; label: string; status: "pending" | "running" | "success" | "failed" }[];
  logs?: { timestamp: string; level: "info" | "warn" | "error"; message: string }[];
  onStageClick?: (stage: Stage) => void;
  showLogs?: boolean;
  compact?: boolean;
}

export function ProgressTracker({
  currentStage,
  progress,
  subSteps = [],
  logs = [],
  onStageClick,
  showLogs = false,
  compact = false,
}: ProgressTrackerProps) {
  const currentIndex = STAGES.findIndex((s) => s.id === currentStage);

  if (compact) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {STAGES.map((stage, i) => {
          const isActive = i === currentIndex;
          const isCompleted = i < currentIndex;
          const StageIcon = stage.icon;
          return (
            <div key={stage.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onStageClick?.(stage.id)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium transition-colors",
                  isCompleted
                    ? "text-success bg-success/10"
                    : isActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <StageIcon className="size-4" />
                <span className="hidden sm:inline">{stage.label}</span>
              </button>
              {i < STAGES.length - 1 && (
                <div className={cn("w-8 h-0.5 rounded mx-1", isCompleted ? "bg-success" : "bg-muted")} />
              )}
            </div>
          );
        })}
        <div className="ml-2 flex-1 h-1.5 bg-muted rounded overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-success transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 阶段导航 */}
      <div className="flex items-center gap-2">
        {STAGES.map((stage, i) => {
          const isActive = i === currentIndex;
          const isCompleted = i < currentIndex;
          const StageIcon = stage.icon;
          return (
            <div key={stage.id} className="flex-1 flex flex-col items-center">
              <button
                type="button"
                onClick={() => onStageClick?.(stage.id)}
                disabled={!isCompleted && !isActive}
                className={cn(
                  "relative w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all",
                  isCompleted
                    ? "bg-success text-white shadow-lg"
                    : isActive
                    ? "bg-primary text-primary-foreground ring-4 ring-ring/20 shadow-lg"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                <StageIcon className="size-5" />
                <span className="text-[10px] font-medium mt-1">{stage.label}</span>
              </button>
              {i < STAGES.length - 1 && (
                <div
                  className={cn(
                    "absolute top-6 left-[calc(50%+6px)] w-full h-1 rounded",
                    isCompleted ? "bg-success" : "bg-muted"
                  )}
                  style={{ width: "100%" }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 当前阶段详情 */}
      {(() => {
        // 当前阶段是否已完结（走到最后一个阶段即视为完成）
        const stageDone = currentIndex >= STAGES.length - 1;
        return (
      <div className={cn("rounded-xl p-4 transition-colors", STAGES[currentIndex].bgColor)}>
        <div className="flex items-start gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", STAGES[currentIndex].bgColor, STAGES[currentIndex].color)}>
            {(() => { const Icon = STAGES[currentIndex].icon; return <Icon className="size-5" />; })()}
          </div>
          <div className="flex-1">
            <h3 className={cn("font-semibold", STAGES[currentIndex].color)}>{STAGES[currentIndex].label}</h3>
            <p className="text-sm text-muted-foreground mt-1">{STAGES[currentIndex].desc}</p>
            <div className="mt-3 h-2 bg-muted rounded overflow-hidden">
              <div
                className={cn("h-full transition-all duration-500", stageDone ? "bg-success" : "bg-primary")}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{progress}% 完成</p>
          </div>
        </div>
      </div>
        );
      })()}

      {/* 子步骤 */}
      {subSteps.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">执行步骤</h4>
          {subSteps.map((step, i) => (
            <div
              key={step.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg bg-card border transition-colors",
                step.status === "running" && "border-primary/40 bg-primary/5",
                step.status === "success" && "border-success/40 bg-success/5",
                step.status === "failed" && "border-destructive/40 bg-destructive/5"
              )}
            >
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                step.status === "pending" && "bg-muted text-muted-foreground",
                step.status === "running" && "bg-primary text-primary-foreground",
                step.status === "success" && "bg-success text-white",
                step.status === "failed" && "bg-destructive text-white"
              )}>
                {step.status === "pending" && <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>}
                {step.status === "running" && <Loader2 className="size-3 animate-spin" />}
                {step.status === "success" && <Check className="size-3" strokeWidth={3} />}
                {step.status === "failed" && <X className="size-3" strokeWidth={3} />}
              </div>
              <span className="text-sm font-medium text-foreground">{step.label}</span>
              {step.status === "running" && <span className="ml-auto text-xs text-primary">进行中...</span>}
              {step.status === "success" && <span className="ml-auto text-xs text-success">已完成</span>}
              {step.status === "failed" && <span className="ml-auto text-xs text-destructive">失败</span>}
            </div>
          ))}
        </div>
      )}

      {/* 实时日志 */}
      {showLogs && logs.length > 0 && (
        <div className="rounded-lg bg-background p-3 font-mono text-xs overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-muted-foreground">实时日志</span>
            <span className="text-success">● LIVE</span>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {logs.slice(-20).map((log, i) => (
              <div key={i} className={cn("flex gap-2", log.level === "error" && "text-destructive", log.level === "warn" && "text-warning")}>
                <span className="text-muted-foreground w-20 shrink-0">{log.timestamp}</span>
                <span className="text-foreground flex-1 break-all">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 待确认卡点 */}
      {currentStage === "awaiting_confirmation" && (
        <div className="rounded-xl border-2 border-purple-500/40 bg-purple-500/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white"><Eye className="size-4" /></span>
            <h4 className="font-semibold text-purple-400">待你确认</h4>
          </div>
          <p className="text-sm text-muted-foreground mb-3">请预览中间产出，确认无误后点击「继续执行」或「请求修改」</p>
          <div className="flex gap-2">
            <button className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium">继续执行</button>
            <button className="flex-1 px-4 py-2 border border-purple-500/40 text-foreground rounded-lg hover:bg-purple-500/10 font-medium">请求修改</button>
          </div>
        </div>
      )}
    </div>
  );
}

export { STAGES };
