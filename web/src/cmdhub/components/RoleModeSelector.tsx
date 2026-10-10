import { BarChart3, Camera, Check, Clapperboard, Scissors, Sprout, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type RoleMode = "novice" | "director" | "photographer" | "editor" | "operator";

interface RoleModeSelectorProps {
  value: RoleMode;
  onChange: (mode: RoleMode) => void;
  disabled?: boolean;
  variant?: "cards" | "tabs" | "compact";
}

const ROLE_CONFIG: Record<RoleMode, { label: string; desc: string; icon: LucideIcon; color: string; bgColor: string; features: string[] }> = {
  novice: {
    label: "小白模式",
    desc: "填空式引导，缺信息强制追问，所见即所得预览",
    icon: Sprout,
    color: "text-success",
    bgColor: "bg-success/10",
    features: ["逐步填空", "自动补全", "预览优先", "一键成片"],
  },
  director: {
    label: "编导模式",
    desc: "专业参数，分镜脚本，多版本对比，创意主导",
    icon: Clapperboard,
    color: "text-primary",
    bgColor: "bg-primary/10",
    features: ["分镜脚本", "运镜设计", "多版本", "创意库"],
  },
  photographer: {
    label: "拍摄模式",
    desc: "打光方案、相机参数、景别运镜、器材清单",
    icon: Camera,
    color: "text-warning",
    bgColor: "bg-warning/10",
    features: ["打光图", "相机参数", "景别表", "器材单"],
  },
  editor: {
    label: "剪辑模式",
    desc: "多轨时间线、卡点配乐、字幕特效、多版本导出",
    icon: Scissors,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    features: ["多轨道", "卡点对齐", "字幕特效", "多版本导出"],
  },
  operator: {
    label: "运营模式",
    desc: "数据诊断、策略生成、自动执行、结果归因",
    icon: BarChart3,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    features: ["数据诊断", "策略生成", "自动执行", "归因报告"],
  },
};

export function RoleModeSelector({
  value,
  onChange,
  disabled = false,
  variant = "cards",
}: RoleModeSelectorProps) {
  const modes: RoleMode[] = ["novice", "director", "photographer", "editor", "operator"];

  if (variant === "compact") {
    return (
      <div className="flex gap-1 bg-muted rounded-lg p-1" role="radiogroup" aria-label="角色模式">
        {modes.map((mode) => {
          const config = ROLE_CONFIG[mode];
          const isSelected = value === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => !disabled && onChange(mode)}
              disabled={disabled}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                isSelected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              title={`${config.label}: ${config.desc}`}
            >
              <config.icon className="size-4" />
              <span className="hidden sm:inline">{config.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === "tabs") {
    return (
      <div className="border-b border-border" role="tablist">
        {modes.map((mode) => {
          const config = ROLE_CONFIG[mode];
          const isSelected = value === mode;
          return (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => !disabled && onChange(mode)}
              disabled={disabled}
              className={cn(
                "flex items-center gap-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                isSelected
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <config.icon className="size-4" />
              <span className="ml-1">{config.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // 卡片模式（默认）
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" role="radiogroup" aria-label="角色模式">
      {modes.map((mode) => {
        const config = ROLE_CONFIG[mode];
        const isSelected = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => !disabled && onChange(mode)}
            disabled={disabled}
            className={cn(
              "relative p-4 rounded-xl border-2 transition-all duration-200",
              "group flex flex-col items-start",
              isSelected
                ? "border-primary bg-primary/10 ring-2 ring-ring/20 shadow-sm"
                : "border-border hover:border-primary/50 hover:bg-muted"
            )}
          >
            {/* 选中指示 */}
            {isSelected && (
              <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                <Check className="size-3" strokeWidth={3} />
              </div>
            )}

            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", config.bgColor, config.color)}>
              <config.icon className="size-5" />
            </div>

            <h3 className="font-semibold text-foreground mb-1">{config.label}</h3>
            <p className="text-xs text-muted-foreground mb-3 line-clamp-2 flex-1">{config.desc}</p>

            <div className="flex flex-wrap gap-1">
              {config.features.map((f) => (
                <span key={f} className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
                  {f}
                </span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export { ROLE_CONFIG };
