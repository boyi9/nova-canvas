"use client";

import { useState } from "react";
import { Shield, Zap, Bot, Hand, Target, AlertTriangle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

// NC-CAP-11 操控模式切换器 M0–M4

export type ControlMode = "M0" | "M1" | "M2" | "M3" | "M4";

export interface ControlModeInfo {
  value: ControlMode;
  label: string;
  category: "半自动" | "自动" | "智能化";
  humanActionsPerDay: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

export const CONTROL_MODES: ControlModeInfo[] = [
  {
    value: "M0",
    label: "手动",
    category: "半自动",
    humanActionsPerDay: "全人工",
    description: "所有操作由人工发起，AI 仅提供辅助信息",
    icon: <Hand className="w-5 h-5" />,
    color: "bg-muted text-gray-700 border-border",
  },
  {
    value: "M1",
    label: "辅助",
    category: "半自动",
    humanActionsPerDay: "约 20 次/日",
    description: "AI 建议 + 人工确认后执行",
    icon: <Shield className="w-5 h-5" />,
    color: "bg-blue-50 text-blue-700 border-blue-300",
  },
  {
    value: "M2",
    label: "流水线",
    category: "半自动",
    humanActionsPerDay: "约 8 次/日",
    description: "自动执行 + 人工把关（默认推荐）",
    icon: <Zap className="w-5 h-5" />,
    color: "bg-green-50 text-green-700 border-green-300",
  },
  {
    value: "M3",
    label: "规则触发",
    category: "自动",
    humanActionsPerDay: "约 2 次/日",
    description: "条件满足时自动执行，红线仍需确认",
    icon: <Bot className="w-5 h-5" />,
    color: "bg-amber-50 text-amber-700 border-amber-300",
  },
  {
    value: "M4",
    label: "目标驱动",
    category: "智能化",
    humanActionsPerDay: "约 1 次/日",
    description: "AI 规划 + 自纠错，发布/花钱仍需确认",
    icon: <Target className="w-5 h-5" />,
    color: "bg-purple-50 text-purple-700 border-purple-300",
  },
];

// 红线动作（全档位需确认）
export const RED_LINE_ACTIONS = ["publish", "spend", "account_security"] as const;

export function isRedLine(action: string): boolean {
  return (RED_LINE_ACTIONS as readonly string[]).includes(action);
}

interface ControlModeSwitcherProps {
  value: ControlMode;
  onChange: (mode: ControlMode) => void;
  className?: string;
  disabled?: boolean;
  degraded?: boolean;
  degradeReason?: string;
}

export function ControlModeSwitcher({
  value,
  onChange,
  className,
  disabled = false,
  degraded = false,
  degradeReason,
}: ControlModeSwitcherProps) {
  const [hovered, setHovered] = useState<ControlMode | null>(null);
  const current = CONTROL_MODES.find((m) => m.value === value) || CONTROL_MODES[2];
  const hoveredInfo = hovered ? CONTROL_MODES.find((m) => m.value === hovered) : null;

  return (
    <div className={cn("space-y-3", className)}>
      {/* 降级状态提示 */}
      {degraded && degradeReason && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="font-medium"><AlertTriangle className="mr-1 inline size-4" /> 已降级：</span>
          {degradeReason}
        </div>
      )}

      {/* 五档切换器 */}
      <div className="flex gap-2" role="radiogroup" aria-label="操控模式">
        {CONTROL_MODES.map((mode) => {
          const isSelected = mode.value === value;
          return (
            <button
              key={mode.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(mode.value)}
              onMouseEnter={() => setHovered(mode.value)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-2 min-w-[80px] transition-all",
                isSelected
                  ? mode.color + " border-current shadow-sm"
                  : "border-border text-muted-foreground hover:border-border",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {mode.icon}
              <span className="text-xs font-medium">{mode.value}</span>
              <span className="text-xs">{mode.label}</span>
            </button>
          );
        })}
      </div>

      {/* 当前/悬停模式详情 */}
      <div className="rounded-md bg-muted px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {hoveredInfo?.value || current.value} {hoveredInfo?.label || current.label}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs",
              (hoveredInfo?.category || current.category) === "智能化"
                ? "bg-purple-100 text-purple-700"
                : (hoveredInfo?.category || current.category) === "自动"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-blue-100 text-blue-700"
            )}
          >
            {hoveredInfo?.category || current.category}
          </span>
        </div>
        <p className="mt-1 text-muted-foreground">
          {hoveredInfo?.description || current.description}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          预期人工动作：{hoveredInfo?.humanActionsPerDay || current.humanActionsPerDay}
        </p>
        <p className="mt-1 text-xs text-red-600">
          <Lock className="mr-1 inline size-3" /> 红线动作（发布/花钱/账号安全）在任何档位均需你确认
        </p>
      </div>
    </div>
  );
}
