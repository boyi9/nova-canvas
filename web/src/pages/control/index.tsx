import { useState, useEffect } from "react";
import { Settings, History, AlertTriangle, Palette, Sparkles, SlidersHorizontal, Wrench, Plus, Eye, BarChart3, Send, Lock, Banknote, ShieldCheck, type LucideIcon } from "lucide-react";
import {
  ControlModeSwitcher,
  type ControlMode,
  isRedLine,
} from "@/components/control-mode-switcher";
import { CallTraceDrawer, type CallTrace } from "@/components/call-trace-drawer";
import { cn } from "@/lib/utils";

// NC-CAP-11 操控面板页面

// 模拟任务数据（生产环境从 API 获取）
const MOCK_TASKS = [
  {
    id: "task-001",
    operation: "create",
    controlMode: "M2" as ControlMode,
    estimateCost: 0.12,
    needConfirm: false,
    description: "生成电商主图 3 张变体",
  },
  {
    id: "task-002",
    operation: "publish",
    controlMode: "M3" as ControlMode,
    estimateCost: 0.0,
    needConfirm: true,
    description: "发布到抖音账号",
  },
  {
    id: "task-003",
    operation: "optimize",
    controlMode: "M4" as ControlMode,
    estimateCost: 0.08,
    needConfirm: false,
    description: "优化低CTR素材",
  },
];

// 模拟留痕数据
const MOCK_TRACES: CallTrace[] = [
  {
    task_id: "task-001",
    step_id: "step-1",
    input_type: "I1",
    operation: "create",
    control_mode: "M2",
    model_alias: "image-edit-primary",
    route_reason: "硬约束通过(3候选); 软评分task=default; score=0.8521",
    cost_cny: 0.12,
    latency_ms: 8500,
    human_confirm: false,
    output_hash: "a1b2c3d4e5f6",
    traced_at: "2026-10-09T22:00:00",
  },
  {
    task_id: "task-002",
    step_id: "step-1",
    input_type: "I2",
    operation: "publish",
    control_mode: "M3",
    model_alias: "llm-orchestrator",
    route_reason: "红线动作，路由到 LLM 编排",
    cost_cny: 0.001,
    latency_ms: 1200,
    human_confirm: true,
    output_hash: "f6e5d4c3b2a1",
    traced_at: "2026-10-09T22:01:00",
  },
];

const OPERATION_LABELS: Record<string, string> = {
  create: "创作",
  optimize: "优化",
  adjust: "调整",
  repair: "修复",
  add: "新增",
  understand: "理解",
  evaluate: "评估",
  publish: "发布",
};

const OPERATION_ICONS: Record<string, LucideIcon> = {
  create: Palette,
  optimize: Sparkles,
  adjust: SlidersHorizontal,
  repair: Wrench,
  add: Plus,
  understand: Eye,
  evaluate: BarChart3,
  publish: Send,
};

export default function ControlPage() {
  const [mode, setMode] = useState<ControlMode>("M2");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [degraded, setDegrade] = useState(false);
  const [degradeReason, setDegradeReason] = useState("");
  const [tasks, setTasks] = useState(MOCK_TASKS);
  const [traces] = useState<CallTrace[]>(MOCK_TRACES);

  // 切换模式后，新任务按新档位执行，历史任务不受影响
  const handleModeChange = (newMode: ControlMode) => {
    setMode(newMode);
    // 模拟降级场景
    if (newMode === "M4") {
      setDegrade(true);
      setDegradeReason("M4 需通过目标审核且启用人工审计，当前未满足，已回退至 M2");
      setTimeout(() => {
        setMode("M2");
        setDegrade(false);
      }, 2000);
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Settings className="w-6 h-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">操控模式面板</h1>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <History className="w-4 h-4" />
          查看留痕
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 左列：模式切换器 */}
        <div className="space-y-6">
          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-medium text-foreground mb-3">操控模式</h2>
            <ControlModeSwitcher
              value={mode}
              onChange={handleModeChange}
              degraded={degraded}
              degradeReason={degradeReason}
            />
          </section>

          {/* 红线说明 */}
          <section className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
            <div className="flex items-center gap-2 text-destructive mb-2">
              <AlertTriangle className="w-4 h-4" />
              <h2 className="text-sm font-medium">红线保护</h2>
            </div>
            <ul className="text-sm text-destructive/90 space-y-1">
              <li className="flex items-center gap-1.5"><Lock className="size-3.5 shrink-0" />发布（publish）— 任何档位均需你确认</li>
              <li className="flex items-center gap-1.5"><Banknote className="size-3.5 shrink-0" />花钱（spend）— 任何档位均需你确认</li>
              <li className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 shrink-0" />账号安全（account_security）— 任何档位均需你确认</li>
            </ul>
            <p className="mt-2 text-xs text-destructive/80">
              此规则为代码级断言，配置错误将导致服务启动失败。
            </p>
          </section>
        </div>

        {/* 右列：任务列表 */}
        <section className="rounded-lg border bg-white p-4">
          <h2 className="text-sm font-medium text-foreground mb-3">
            当前档位下的任务（{mode}）
          </h2>
          <div className="space-y-3">
            {tasks.map((task) => {
              const redLine = isRedLine(task.operation);
              const OpIcon = OPERATION_ICONS[task.operation] || Settings;
              return (
                <div
                  key={task.id}
                  className={cn(
                    "rounded-md border p-3",
                    redLine ? "border-destructive/40 bg-destructive/10" : "border-border"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <OpIcon className="size-4 shrink-0 text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {OPERATION_LABELS[task.operation] || task.operation}
                          </span>
                          {redLine && (
                            <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                              <AlertTriangle className="size-3" />
                              需你确认
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {task.description}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>¥{task.estimateCost.toFixed(2)}</div>
                      <div className="text-muted-foreground">{task.controlMode}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* 留痕抽屉 */}
      <CallTraceDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        traces={traces}
      />
    </div>
  );
}
