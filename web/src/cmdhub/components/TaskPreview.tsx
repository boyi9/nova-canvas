import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskPreviewProps {
  task: {
    id: string;
    intent: string;
    role: string;
    plan: {
      steps: { id: string; label: string; estimatedTime: string; dependencies: string[] }[];
      requiredResources: { type: string; name: string; status: "available" | "missing" | "generating" }[];
      estimatedCost: number;
      estimatedDuration: string;
    };
    warnings: string[];
  };
  onConfirm: () => void;
  onModify: () => void;
  onCancel: () => void;
}

export function TaskPreview({ task, onConfirm, onModify, onCancel }: TaskPreviewProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-start justify-between p-4 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900">执行计划预览</h2>
            <p className="text-sm text-muted-foreground mt-1">{task.intent}</p>
            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-1", task.role === "novice" && "bg-green-50 text-green-700", task.role === "director" && "bg-blue-50 text-blue-700", task.role === "photographer" && "bg-amber-50 text-amber-700", task.role === "editor" && "bg-purple-50 text-purple-700", task.role === "operator" && "bg-red-50 text-red-700")}>
              {task.role} 模式
            </span>
          </div>
          <button onClick={onCancel} className="p-2 rounded-lg hover:bg-gray-100 text-muted-foreground">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* 预估信息 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-xs text-muted-foreground">预估时长</p>
              <p className="font-semibold text-gray-900">{task.plan.estimatedDuration}</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-xs text-muted-foreground">预估成本</p>
              <p className="font-semibold text-gray-900">¥{task.plan.estimatedCost.toFixed(2)}</p>
            </div>
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-xs text-muted-foreground">执行步骤</p>
              <p className="font-semibold text-gray-900">{task.plan.steps.length} 步</p>
            </div>
          </div>

          {/* 所需资源 */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">所需资源</h3>
            <div className="space-y-2">
              {task.plan.requiredResources.map((res) => (
                <div
                  key={res.name}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    res.status === "available" && "border-green-200 bg-green-50",
                    res.status === "missing" && "border-red-200 bg-red-50",
                    res.status === "generating" && "border-blue-200 bg-blue-50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      res.status === "available" && "bg-green-500",
                      res.status === "missing" && "bg-red-500",
                      res.status === "generating" && "bg-primary animate-pulse"
                    )} />
                    <span className="text-sm font-medium text-gray-700">{res.name}</span>
                    <span className="px-2 py-0.5 text-[10px] rounded bg-gray-100 text-muted-foreground">{res.type}</span>
                  </div>
                  <span className={cn(
                    "px-2 py-0.5 text-[10px] rounded-full font-medium",
                    res.status === "available" && "bg-green-100 text-green-700",
                    res.status === "missing" && "bg-red-100 text-red-700",
                    res.status === "generating" && "bg-blue-100 text-blue-700"
                  )}>
                    {res.status === "available" && <><Check className="mr-0.5 inline size-3" /> 就绪</>}
                    {res.status === "missing" && <><X className="mr-0.5 inline size-3" /> 缺失</>}
                    {res.status === "generating" && "⟳ 生成中"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 执行步骤 */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">执行步骤 ({task.plan.steps.length})</h3>
            <div className="space-y-2">
              {task.plan.steps.map((step, i) => (
                <div key={step.id} className="p-3 rounded-lg bg-gray-50 border">
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{step.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">预计 {step.estimatedTime}</p>
                      {step.dependencies.length > 0 && (
                        <p className="text-xs text-blue-600 mt-1">依赖: {step.dependencies.join(", ")}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 警告 */}
          {task.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <h4 className="font-medium text-amber-800 mb-2 flex items-center gap-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                注意事项
              </h4>
              <ul className="text-sm text-amber-700 space-y-1 mt-1">
                {task.warnings.map((w, i) => (
                  <li key={i} className="flex gap-1">• {w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-3 p-4 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onCancel} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">
            取消
          </button>
          <button onClick={onModify} className="px-4 py-2 text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 font-medium">
            修改计划
          </button>
          <button onClick={onConfirm} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium">
            确认执行
          </button>
        </div>
      </div>
    </div>
  );
}