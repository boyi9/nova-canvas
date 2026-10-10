import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { message } from "antd";
import { CommandInput } from "@/cmdhub/components/CommandInput";
import { MaterialDropZone, type MaterialItem } from "@/cmdhub/components/MaterialDropZone";
import { RoleModeSelector } from "@/cmdhub/components/RoleModeSelector";
import { ProgressTracker } from "@/cmdhub/components/ProgressTracker";
import { TaskPreview } from "@/cmdhub/components/TaskPreview";
import { cn } from "@/lib/utils";
import { FolderOpen, Send, Sparkles, Trash2, RotateCcw, Zap } from "lucide-react";
import { generateImage, generateVideo, getGenerationStatus, parseRetouchIntent, retouchGate } from "@/services/nova/api";

type RoleMode = "novice" | "director" | "photographer" | "editor" | "operator";
type Stage = "planning" | "executing" | "awaiting_confirmation" | "delivered";

interface ExecutionTask {
  id: string;
  intent: string;
  role: RoleMode;
  materials: MaterialItem[];
  stage: Stage;
  progress: number;
  subSteps: { id: string; label: string; status: "pending" | "running" | "success" | "failed" }[];
  logs: { timestamp: string; level: "info" | "warn" | "error"; message: string }[];
  plan: {
    steps: { id: string; label: string; estimatedTime: string; dependencies: string[] }[];
    requiredResources: { type: string; name: string; status: "available" | "missing" | "generating" }[];
    estimatedCost: number;
    estimatedDuration: string;
  };
  warnings: string[];
  createdAt: number;
}

const STEP_KEYS = ["parse", "plan", "resources", "execute", "review", "deliver"] as const;

type StepKey = (typeof STEP_KEYS)[number];

function buildInitialSteps(t: (key: string) => string) {
  return STEP_KEYS.map((id: StepKey) => ({
    id,
    label: t(`cmdHub.step.${id}`),
    status: "pending" as const,
  }));
}

const ROLE_PLANS: Record<string, { steps: string[]; resources: string[]; cost: number; duration: string }> = {
  novice: {
    steps: ["解析需求", "补全参数", "选择模板", "生成内容", "质检预览", "导出交付"],
    resources: ["模板库", "素材库", "品牌配方"],
    cost: 0.15,
    duration: "3-5 分钟",
  },
  director: {
    steps: ["需求分析", "创意大纲", "分镜脚本", "分镜生成", "运镜合成", "多版本对比", "最终定版"],
    resources: ["剧本库", "分镜模板", "运镜预设", "音乐库"],
    cost: 0.45,
    duration: "10-15 分钟",
  },
  photographer: {
    steps: ["需求分析", "打光方案设计", "相机参数计算", "拍摄指导单生成", "素材回传QC", "批量导出"],
    resources: ["打光预设", "相机参数库", "景别对照表", "器材清单"],
    cost: 0.08,
    duration: "5-8 分钟",
  },
  editor: {
    steps: ["素材整理", "粗剪", "精剪卡点", "字幕特效", "配乐混音", "多版本导出", "质检"],
    resources: ["剪辑模板", "字幕预设", "转场库", "音乐库", "音效库"],
    cost: 0.25,
    duration: "8-12 分钟",
  },
  operator: {
    steps: ["数据拉取", "指标诊断", "问题定位", "策略生成", "执行计划", "自动执行", "结果归因"],
    resources: ["数据API", "诊断规则", "策略模板", "执行器"],
    cost: 0.12,
    duration: "5-10 分钟",
  },
};

export default function CmdHubPage() {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [role, setRole] = useState<RoleMode>("novice");
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [currentTask, setCurrentTask] = useState<ExecutionTask | null>(null);
  const [history, setHistory] = useState<ExecutionTask[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewTask, setPreviewTask] = useState<ExecutionTask | null>(null);

  // 处理文件上传
  const handleAddMaterials = useCallback((files: File[]) => {
    const newMaterials: MaterialItem[] = files.map((file) => ({
      id: `mat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: file.name,
      type: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "audio",
      url: URL.createObjectURL(file),
      size: file.size,
      mimeType: file.type,
    }));
    setMaterials((prev) => [...prev, ...newMaterials]);
  }, []);

  const handleRemoveMaterial = useCallback((id: string) => {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // 提交指令
  const handleSubmit = useCallback(() => {
    if (!input.trim()) return;

    const plan = ROLE_PLANS[role] || ROLE_PLANS.novice;
    const now = Date.now();

    const task: ExecutionTask = {
      id: `task-${now}`,
      intent: input,
      role,
      materials: [...materials],
      stage: "planning",
      progress: 0,
      subSteps: buildInitialSteps(t).map((s) => ({ ...s, status: "pending" as const })),
      logs: [{ timestamp: new Date().toLocaleTimeString(), level: "info", message: t("cmdHub.log.start", { intent: input }) }],
      plan: {
        steps: plan.steps.map((label, i) => ({
          id: `step-${i}`,
          label,
          estimatedTime: t("cmdHub.estMinutes", {
            count: Math.ceil(parseFloat(plan.duration) / plan.steps.length),
          }),
          dependencies: i > 0 ? [`step-${i - 1}`] : [],
        })),
        requiredResources: plan.resources.map((r) => ({
          type: "resource",
          name: r,
          status: "available" as const,
        })),
        estimatedCost: plan.cost,
        estimatedDuration: plan.duration,
      },
      warnings: materials.length === 0 ? [t("cmdHub.noMaterialWarn")] : [],
      createdAt: now,
    };

    setCurrentTask(task);
    setShowPreview(true);
    setPreviewTask(task);
    setInput("");
  }, [input, role, materials]);

  // 确认执行
  const handleConfirm = useCallback(() => {
    if (!previewTask) return;
    const executingTask: ExecutionTask = {
      ...previewTask,
      stage: "executing",
      progress: 5,
      subSteps: previewTask.subSteps.map((s, i) => ({ ...s, status: i === 0 ? "running" : "pending" })),
      logs: [...previewTask.logs, { timestamp: new Date().toLocaleTimeString(), level: "info", message: t("cmdHub.log.begin") }],
    };
    setCurrentTask(executingTask);
    setShowPreview(false);
    setPreviewTask(null);

    executeTask(executingTask);
  }, [previewTask, t]);

  const handleModify = useCallback(() => {
    setShowPreview(false);
    setPreviewTask(null);
  }, []);

  const handleCancel = useCallback(() => {
    setShowPreview(false);
    setPreviewTask(null);
  }, []);

  const updateTask = useCallback((taskId: string, updater: (prev: ExecutionTask) => ExecutionTask) => {
    setCurrentTask((prev) => (prev?.id === taskId ? updater(prev) : prev));
  }, []);

  const addLog = useCallback((taskId: string, level: "info" | "warn" | "error", msg: string) => {
    updateTask(taskId, (prev) => ({
      ...prev,
      logs: [...prev.logs, { timestamp: new Date().toLocaleTimeString(), level, message: msg }],
    }));
  }, [updateTask]);

  const setStepStatus = useCallback((taskId: string, stepIdx: number, status: "pending" | "running" | "success" | "failed") => {
    updateTask(taskId, (prev) => ({
      ...prev,
      subSteps: prev.subSteps.map((s, i) => (i === stepIdx ? { ...s, status } : s)),
    }));
  }, [updateTask]);

  const detectIntentType = (intent: string): "image" | "video" | "retouch" | "general" => {
    if (/主图|生图|图片|海报|详情图|白底|场景图/.test(intent)) return "image";
    if (/视频|短片|剪辑|分镜|短视频/.test(intent)) return "video";
    if (/修图|磨皮|祛斑|美白|调色|精修/.test(intent)) return "retouch";
    return "general";
  };

  const executeTask = useCallback(async (task: ExecutionTask) => {
    const totalSteps = task.subSteps.length;
    const intentType = detectIntentType(task.intent);

    try {
      // Step 1: 解析意图
      setStepStatus(task.id, 0, "running");
      addLog(task.id, "info", t("cmdHub.log.intentParsed", { intent: task.intent, type: intentType }));
      await new Promise((r) => setTimeout(r, 300));
      setStepStatus(task.id, 0, "success");

      // Step 2: 生成计划
      setStepStatus(task.id, 1, "running");
      addLog(task.id, "info", t("cmdHub.log.planBuilt", { steps: task.plan.steps.length, cost: task.plan.estimatedCost }));
      await new Promise((r) => setTimeout(r, 300));
      setStepStatus(task.id, 1, "success");

      // Step 3: 准备资源
      setStepStatus(task.id, 2, "running");
      addLog(task.id, "info", t("cmdHub.log.materialsReady", { count: task.materials.length }));
      await new Promise((r) => setTimeout(r, 300));
      setStepStatus(task.id, 2, "success");

      // Step 4: 执行生成
      setStepStatus(task.id, 3, "running");
      updateTask(task.id, (prev) => ({ ...prev, progress: 40 }));

      if (intentType === "image") {
        addLog(task.id, "info", t("cmdHub.log.imageCall"));
        const result = await generateImage(task.intent, { width: 1024, height: 1024 });
        addLog(task.id, "info", t("cmdHub.log.submitted", { id: result.task_id, status: result.status }));

        const maxPolls = 30;
        let done = false;
        for (let i = 0; i < maxPolls; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const status = await getGenerationStatus(result.task_id);
          updateTask(task.id, (prev) => ({ ...prev, progress: 40 + Math.floor((i / maxPolls) * 40) }));
          if (status.status === "success") {
            addLog(task.id, "info", t("cmdHub.log.generated", { url: status.result_url ?? "-" }));
            done = true;
            break;
          }
          if (status.status === "failed") {
            addLog(task.id, "error", t("cmdHub.log.generateFailed", { error: status.error ?? "-" }));
            setStepStatus(task.id, 3, "failed");
            return;
          }
        }
        if (!done) {
          addLog(task.id, "warn", t("cmdHub.log.pollTimeout", { count: maxPolls }));
        }
      } else if (intentType === "video") {
        addLog(task.id, "info", t("cmdHub.log.videoCall"));
        const result = await generateVideo(task.intent, { duration: 5 });
        addLog(task.id, "info", t("cmdHub.log.submitted", { id: result.task_id, status: result.status }));

        const maxPolls = 40;
        let done = false;
        for (let i = 0; i < maxPolls; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const status = await getGenerationStatus(result.task_id);
          updateTask(task.id, (prev) => ({ ...prev, progress: 40 + Math.floor((i / maxPolls) * 40) }));
          if (status.status === "success") {
            addLog(task.id, "info", t("cmdHub.log.generated", { url: status.result_url ?? "-" }));
            done = true;
            break;
          }
          if (status.status === "failed") {
            addLog(task.id, "error", t("cmdHub.log.generateFailed", { error: status.error ?? "-" }));
            setStepStatus(task.id, 3, "failed");
            return;
          }
        }
        if (!done) {
          addLog(task.id, "warn", t("cmdHub.log.pollTimeout", { count: maxPolls }));
        }
      } else if (intentType === "retouch") {
        addLog(task.id, "info", t("cmdHub.log.retouchParse"));
        const parsed = await parseRetouchIntent(task.intent);
        addLog(task.id, "info", t("cmdHub.log.opsParsed", {
          ops: parsed.ops.map((o) => o.name).join(", ") || "-",
          level: parsed.level,
        }));
        if (parsed.redlines.length > 0) {
          addLog(task.id, "error", t("cmdHub.log.redline", { rules: parsed.redlines.join(", ") }));
          setStepStatus(task.id, 3, "failed");
          message.error(t("cmdHub.log.redlineBlocked"));
          return;
        }
        if (parsed.ops.length === 0) {
          addLog(task.id, "warn", t("cmdHub.log.noOps", {
            questions: parsed.questions.length ? `: ${parsed.questions.join(" / ")}` : "",
          }));
          setStepStatus(task.id, 3, "failed");
          return;
        }
        const gate = await retouchGate(task.intent);
        addLog(
          task.id,
          gate.allowed ? "info" : "warn",
          gate.allowed ? t("cmdHub.log.gatePass") : t("cmdHub.log.gateBlock", { reason: gate.reason ?? "-" }),
        );
        if (!gate.allowed) {
          setStepStatus(task.id, 3, "failed");
          message.error(t("cmdHub.log.gateFailed"));
          return;
        }
        updateTask(task.id, (prev) => ({ ...prev, progress: 80 }));
        addLog(task.id, "info", t("cmdHub.log.retouchReady", { count: parsed.ops.length, target: parsed.target }));
      } else {
        addLog(task.id, "warn", t("cmdHub.log.unknownType"));
        setStepStatus(task.id, 3, "failed");
        return;
      }
      setStepStatus(task.id, 3, "success");

      // Step 5: 质检
      setStepStatus(task.id, 4, "running");
      addLog(task.id, "info", t("cmdHub.log.qc"));
      await new Promise((r) => setTimeout(r, 500));
      addLog(task.id, "info", t("cmdHub.log.qcPass"));
      setStepStatus(task.id, 4, "success");

      // Step 6: 交付
      setStepStatus(task.id, 5, "running");
      addLog(task.id, "info", t("cmdHub.log.export"));
      await new Promise((r) => setTimeout(r, 500));
      setStepStatus(task.id, 5, "success");

      // 完成
      updateTask(task.id, (prev) => ({
        ...prev,
        stage: "awaiting_confirmation",
        progress: 95,
        subSteps: prev.subSteps.map((s) => ({ ...s, status: "success" as const })),
        logs: [...prev.logs, { timestamp: new Date().toLocaleTimeString(), level: "info", message: t("cmdHub.log.done") }],
      }));
    } catch (e) {
      addLog(task.id, "error", t("cmdHub.log.execError", { message: e instanceof Error ? e.message : String(e) }));
      setStepStatus(task.id, 3, "failed");
      message.error(t("cmdHub.log.failedToast"));
    }
  }, [addLog, setStepStatus, updateTask, t]);

  // 继续执行（从待确认到交付）
  const handleContinue = useCallback(() => {
    // 在点击时取快照：setTimeout 回调内无法再访问 updater 的 prev
    const finished: ExecutionTask | null = currentTask;
    if (!finished) return;

    setCurrentTask({
      ...finished,
      stage: "delivered",
      progress: 100,
      logs: [...finished.logs, { timestamp: new Date().toLocaleTimeString(), level: "info", message: t("cmdHub.log.confirmed") }],
    });

    // 稍后写入历史并清空当前任务
    setTimeout(() => {
      const archived: ExecutionTask = {
        ...finished,
        logs: [...finished.logs, { timestamp: new Date().toLocaleTimeString(), level: "info", message: t("cmdHub.log.delivered") }],
      };
      setHistory((h) => [archived, ...h].slice(0, 20));
      setCurrentTask(null);
    }, 1500);
  }, [currentTask, t]);

  const handleRequestChange = useCallback(() => {
    setCurrentTask((prev) => prev ? {
      ...prev,
      stage: "planning",
      progress: 0,
      subSteps: buildInitialSteps(t).map((s) => ({ ...s, status: "pending" as const })),
      logs: [...prev.logs, { timestamp: new Date().toLocaleTimeString(), level: "warn", message: t("cmdHub.log.replan") }],
    } : null);
  }, []);

  return (
    <div className="min-h-screen bg-muted flex flex-col">
      {/* 顶部栏 */}
      <header className="h-14 bg-white border-b flex items-center justify-between px-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
            <Zap className="size-4" />
          </div>
          <h1 className="text-lg font-bold text-foreground">{t("cmdHub.title")}</h1>
          <span className="px-2 py-0.5 text-xs rounded bg-muted text-muted-foreground">v1.0</span>
        </div>
        <div className="flex items-center gap-2">
          <RoleModeSelector value={role} onChange={setRole} variant="compact" disabled={!!currentTask} />
          <button
            onClick={() => { setMaterials([]); setInput(""); }}
            disabled={!!currentTask}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4 mr-1" /> {t("cmdHub.reset")}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：输入区 */}
        <aside className="w-full lg:w-96 border-r bg-white flex flex-col flex-shrink-0">
          {/* 角色模式选择 */}
          <div className="p-4 border-b">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">{t("cmdHub.roleMode")}</label>
            <RoleModeSelector value={role} onChange={setRole} disabled={!!currentTask} />
          </div>

          {/* 指令输入 */}
          <div className="p-4 border-b flex-1 flex flex-col">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">{t("cmdHub.oneLiner")}</label>
            <CommandInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              role={role}
              disabled={!!currentTask}
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {t("cmdHub.counter", {
                  chars: input.length,
                  words: input.split(/\s+/).filter(Boolean).length,
                })}
              </span>
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || !!currentTask}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50 flex items-center gap-1"
              >
                <Send className="w-4 h-4" /> {t("cmdHub.send")}
              </button>
            </div>
          </div>

          {/* 素材拖拽区 */}
          <div className="p-4 border-b flex-1 min-h-[200px]">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">{t("cmdHub.materials")}</label>
            <MaterialDropZone
              materials={materials}
              onAdd={handleAddMaterials}
              onRemove={handleRemoveMaterial}
              onReorder={setMaterials}
              maxFiles={10}
              disabled={!!currentTask}
            />
            {materials.length > 0 && (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("cmdHub.fileCount", { count: materials.length })}</span>
                <button
                  onClick={() => setMaterials([])}
                  className="text-xs text-destructive hover:text-destructive/80"
                >
                  <Trash2 className="w-3 h-3 mr-1 inline" /> {t("cmdHub.clearAll")}
                </button>
              </div>
            )}
          </div>

          {/* 快捷模板 */}
          <div className="p-4">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">{t("cmdHub.quickTemplates")}</label>
            <div className="grid grid-cols-2 gap-2">
              {(["mainImage", "shortVideo", "analytics", "edit"] as const).map((key) => {
                const tmpl = t(`cmdHub.templates.${key}`);
                return (
                  <button
                    key={key}
                    onClick={() => setInput(tmpl)}
                    disabled={!!currentTask}
                    className="p-2 text-xs text-left border rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-50"
                    title={t("cmdHub.fillHint")}
                  >
                    {tmpl.slice(0, 30)}...
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* 右侧：执行区 */}
        <main className="flex-1 flex flex-col min-w-0">
          {currentTask ? (
            <>
              {/* 进度追踪 */}
              <div className="p-4 border-b bg-card sticky top-14 z-10">
                <ProgressTracker
                  currentStage={currentTask.stage}
                  progress={currentTask.progress}
                  subSteps={currentTask.subSteps}
                  logs={currentTask.logs.slice(-10)}
                  showLogs={true}
                  compact={false}
                />
              </div>

              {/* 执行详情 */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* 基本信息 */}
                <div className="bg-card rounded-xl border p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{currentTask.intent}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t("cmdHub.roleBadge", { role: currentTask.role })} ·{" "}
                        {new Date(currentTask.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-medium",
                      currentTask.stage === "planning" && "bg-primary/10 text-primary",
                      currentTask.stage === "executing" && "bg-warning/10 text-warning",
                      currentTask.stage === "awaiting_confirmation" && "bg-purple-500/10 text-purple-400",
                      currentTask.stage === "delivered" && "bg-success/10 text-success"
                    )}>
                      {currentTask.stage}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="p-2 bg-muted rounded"><span className="text-muted-foreground">{t("cmdHub.estCost")}</span><br/><span className="font-semibold">¥{currentTask.plan.estimatedCost.toFixed(2)}</span></div>
                    <div className="p-2 bg-muted rounded"><span className="text-muted-foreground">{t("cmdHub.estDuration")}</span><br/><span className="font-semibold">{currentTask.plan.estimatedDuration}</span></div>
                    <div className="p-2 bg-muted rounded"><span className="text-muted-foreground">{t("cmdHub.materialCount")}</span><br/><span className="font-semibold">{currentTask.materials.length}</span></div>
                  </div>
                </div>

                {/* 执行步骤 */}
                <div className="bg-card rounded-xl border p-4">
                  <h4 className="font-medium text-foreground mb-3">{t("cmdHub.steps")}</h4>
                  <div className="space-y-2">
                    {currentTask.subSteps.map((step, i) => (
                      <div key={step.id} className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                        step.status === "running" && "border-primary/40 bg-primary/10",
                        step.status === "success" && "border-success/40 bg-success/10",
                        step.status === "failed" && "border-destructive/40 bg-destructive/10"
                      )}>
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                          step.status === "pending" && "bg-muted text-muted-foreground",
                          step.status === "running" && "bg-primary text-primary-foreground animate-pulse",
                          step.status === "success" && "bg-success/100 text-foreground",
                          step.status === "failed" && "bg-destructive/100 text-foreground"
                        )}>
                          {step.status === "pending" && <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>}
                          {step.status === "running" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" strokeDashoffset="31.4" className="animate-spin"/></svg>}
                          {step.status === "success" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                          {step.status === "failed" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                        </div>
                        <span className="text-sm font-medium text-foreground">{step.label}</span>
                        {step.status === "running" && <span className="ml-auto text-xs text-primary animate-pulse">{t("cmdHub.running")}</span>}
                        {step.status === "success" && <span className="ml-auto text-xs text-success">{t("cmdHub.completed")}</span>}
                        {step.status === "failed" && <span className="ml-auto text-xs text-destructive">{t("cmdHub.failed")}</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 实时日志 */}
                <div className="bg-card rounded-xl border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-foreground">{t("cmdHub.liveLogs")}</span>
                    <span className="text-success text-sm">● LIVE</span>
                  </div>
                  <div className="rounded bg-background p-3 font-mono text-xs max-h-64 overflow-y-auto text-foreground space-y-1">
                    {currentTask.logs.slice(-15).map((log, i) => (
                      <div key={i} className={cn("flex gap-2", log.level === "error" && "text-red-400", log.level === "warn" && "text-yellow-400")}>
                        <span className="text-muted-foreground w-20 shrink-0">{log.timestamp}</span>
                        <span className={cn("flex-1 break-all", log.level === "error" && "text-red-400", log.level === "warn" && "text-yellow-400")}>{log.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 待确认操作栏 */}
              {currentTask.stage === "awaiting_confirmation" && (
                <div className="p-4 border-t bg-card sticky bottom-0 z-10 shadow-lg">
                  <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-medium text-purple-400">{t("cmdHub.doneConfirm")}</p>
                      <p className="text-sm text-purple-400">{t("cmdHub.doneConfirmHint")}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleRequestChange} className="px-4 py-2 border border-purple-500/40 text-purple-400 rounded-lg hover:bg-purple-500/10 font-medium">{t("cmdHub.requestChange")}</button>
                      <button onClick={handleContinue} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium">{t("cmdHub.confirmDeliver")}</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* 空状态 */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md px-4">
                <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                  <Zap className="size-10" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">{t("cmdHub.emptyTitle")}</h2>
                <p className="text-muted-foreground mb-8">{t("cmdHub.emptyDesc")}</p>
                <div className="grid grid-cols-3 gap-4 text-sm text-center">
                  <div className="p-4 rounded-xl bg-primary/10"><p className="font-medium text-primary">{t("cmdHub.stagePlanning")}</p><p className="text-primary text-xs">{t("cmdHub.stagePlanningSub")}</p></div>
                  <div className="p-4 rounded-xl bg-warning/10"><p className="font-medium text-warning">{t("cmdHub.stageExecuting")}</p><p className="text-warning text-xs">{t("cmdHub.stageExecutingSub")}</p></div>
                  <div className="p-4 rounded-xl bg-success/10"><p className="font-medium text-success">{t("cmdHub.stageDelivered")}</p><p className="text-success text-xs">{t("cmdHub.stageDeliveredSub")}</p></div>
                </div>
                 </div>
               </div>
              )
          }

          {/* 历史记录 */}
          {history.length > 0 && (
            <aside className="w-full lg:w-80 border-l bg-card hidden lg:block">
              <div className="p-4 border-b">
                <h3 className="font-medium text-foreground">{t("cmdHub.history")}</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {history.slice(0, 10).map((task) => (
                  <div key={task.id} className="p-3 rounded-lg bg-muted border hover:bg-accent transition-colors cursor-pointer">
                    <p className="text-sm font-medium text-foreground truncate">{task.intent}</p>
                    <p className="text-xs text-muted-foreground mt-1">{task.role} · {new Date(task.createdAt).toLocaleTimeString()}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={cn("px-1.5 py-0.5 text-[10px] rounded", task.stage === "delivered" && "bg-success/10 text-success", task.stage === "awaiting_confirmation" && "bg-purple-500/10 text-purple-400", "bg-muted text-muted-foreground")}>
                        {task.stage}
                      </span>
                      <span className="text-[10px] text-muted-foreground">¥{task.plan.estimatedCost.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          )}

          {/* 预览弹窗 */}
          {showPreview && previewTask && (
            <TaskPreview
              task={previewTask}
              onConfirm={handleConfirm}
              onModify={handleModify}
              onCancel={handleCancel}
            />
          )}
        </main>
      </div>
    </div>
  );
}