"use client";

import { useState } from "react";
import { X, Search, FileText, Clock, DollarSign, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { isRedLine } from "@/components/control-mode-switcher";

// NC-CAP-11 留痕抽屉：展示调用留痕字段，支持按 task_id 检索

export interface CallTrace {
  task_id: string;
  step_id: string;
  input_type: string;
  operation: string;
  control_mode: string;
  model_alias: string;
  model_version?: string;
  prompt_version?: string;
  route_reason: string;
  cost_cny: number;
  latency_ms: number;
  human_confirm: boolean;
  output_hash: string;
  traced_at: string;
}

interface CallTraceDrawerProps {
  open: boolean;
  onClose: () => void;
  traces: CallTrace[];
  className?: string;
}

// 七类操作图标
const OPERATION_LABELS: Record<string, string> = {
  create: "创作",
  optimize: "优化",
  adjust: "调整",
  repair: "修复",
  add: "新增",
  understand: "理解",
  evaluate: "评估",
};

const OPERATION_COLORS: Record<string, string> = {
  create: "bg-blue-100 text-blue-700",
  optimize: "bg-green-100 text-green-700",
  adjust: "bg-amber-100 text-amber-700",
  repair: "bg-red-100 text-red-700",
  add: "bg-purple-100 text-purple-700",
  understand: "bg-muted text-gray-700",
  evaluate: "bg-cyan-100 text-cyan-700",
};

const MODE_LABELS: Record<string, string> = {
  M0: "手动",
  M1: "辅助",
  M2: "流水线",
  M3: "规则触发",
  M4: "目标驱动",
};

export function CallTraceDrawer({ open, onClose, traces, className }: CallTraceDrawerProps) {
  const [searchTaskId, setSearchTaskId] = useState("");
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);

  const filtered = searchTaskId
    ? traces.filter((t) => t.task_id.toLowerCase().includes(searchTaskId.toLowerCase()))
    : traces;

  const totalCost = filtered.reduce((sum, t) => sum + t.cost_cny, 0);
  const avgLatency = filtered.length
    ? filtered.reduce((sum, t) => sum + t.latency_ms, 0) / filtered.length
    : 0;

  if (!open) return null;

  return (
    <div className={cn("fixed inset-0 z-50 flex", className)}>
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* 抽屉 */}
      <div className="relative ml-auto w-full max-w-2xl bg-white shadow-xl flex flex-col h-full">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">调用留痕</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {filtered.length} 条
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 搜索与统计 */}
        <div className="border-b px-4 py-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchTaskId}
              onChange={(e) => setSearchTaskId(e.target.value)}
              placeholder="按 task_id 检索..."
              className="w-full rounded-md border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              总成本 ¥{totalCost.toFixed(4)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              平均延迟 {avgLatency.toFixed(0)}ms
            </span>
          </div>
        </div>

        {/* 留痕列表 */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mb-2" />
              <p>暂无留痕记录</p>
            </div>
          ) : (
            filtered.map((trace, idx) => {
              const isExpanded = expandedTrace === `${trace.task_id}-${idx}`;
              const needsConfirm = isRedLine(trace.operation) && !trace.human_confirm;
              return (
                <div
                  key={`${trace.task_id}-${idx}`}
                  className="border-b border-gray-100"
                >
                  {/* 摘要行 */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTrace(isExpanded ? null : `${trace.task_id}-${idx}`)
                    }
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-left"
                  >
                    {/* 操作类型 */}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
                        OPERATION_COLORS[trace.operation] || "bg-muted text-gray-700"
                      )}
                    >
                      {OPERATION_LABELS[trace.operation] || trace.operation}
                    </span>

                    {/* 控制模式 */}
                    <span className="text-xs text-muted-foreground shrink-0">
                      {trace.control_mode} {MODE_LABELS[trace.control_mode]}
                    </span>

                    {/* 模型 */}
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {trace.model_alias}
                    </span>

                    {/* 红线角标 */}
                    {needsConfirm && (
                      <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                        <AlertTriangle className="mr-0.5 inline size-3" /> 需确认
                      </span>
                    )}

                    {/* 成本 */}
                    <span className="text-xs text-muted-foreground shrink-0">
                      ¥{trace.cost_cny.toFixed(4)}
                    </span>
                  </button>

                  {/* 展开详情 */}
                  {isExpanded && (
                    <div className="bg-muted px-4 py-3 space-y-2 text-xs">
                      <DetailRow label="task_id" value={trace.task_id} />
                      <DetailRow label="step_id" value={trace.step_id} />
                      <DetailRow label="输入类型" value={trace.input_type} />
                      <DetailRow label="操作" value={trace.operation} />
                      <DetailRow label="控制模式" value={`${trace.control_mode} (${MODE_LABELS[trace.control_mode]})`} />
                      <DetailRow label="模型" value={trace.model_alias} />
                      {trace.model_version && (
                        <DetailRow label="模型版本" value={trace.model_version} />
                      )}
                      {trace.prompt_version && (
                        <DetailRow label="提示词版本" value={trace.prompt_version} />
                      )}
                      <DetailRow label="路由理由" value={trace.route_reason} mono />
                      <DetailRow label="成本" value={`¥${trace.cost_cny.toFixed(6)}`} />
                      <DetailRow label="延迟" value={`${trace.latency_ms.toFixed(1)}ms`} />
                      <DetailRow
                        label="人工确认"
                        value={trace.human_confirm ? "✓ 已确认" : "✗ 未确认"}
                      />
                      <DetailRow label="输出哈希" value={trace.output_hash} mono />
                      <DetailRow label="留痕时间" value={trace.traced_at} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("flex-1 text-gray-800 break-all", mono && "font-mono")}>
        {value}
      </span>
    </div>
  );
}
