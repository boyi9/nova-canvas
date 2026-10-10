import type { Recipe } from "@/lib/canvas/recipe-adapter";
import type { WorkflowGraph, WorkflowRunResponse } from "@/lib/canvas/workflow-run";

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";

export type { Recipe, WorkflowGraph, WorkflowRunResponse };

interface ApiError {
  code: number;
  message: string;
  detail?: string;
}

export class NovaApiError extends Error {
  code: number;
  detail?: string;
  constructor(err: ApiError) {
    super(err.message);
    this.code = err.code;
    this.detail = err.detail;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("nova_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const body = await res.json();

  if (!res.ok) {
    throw new NovaApiError(body.error || { code: res.status, message: "Unknown error" });
  }

  return body as T;
}

// Auth
export async function register(email: string, password: string, name: string) {
  return request<{ user: any; token: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
}

export async function login(email: string, password: string) {
  return request<{ user: any; token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

// Projects
export async function listProjects(limit = 20, offset = 0) {
  return request<{ projects: any[]; total: number }>(`/projects?limit=${limit}&offset=${offset}`);
}

export async function createProject(name: string, scene: string, description = "") {
  return request<any>("/projects", {
    method: "POST",
    body: JSON.stringify({ name, scene, description }),
  });
}

export async function updateProject(id: string, data: { name?: string; canvas_data?: string; status?: string }) {
  return request<any>(`/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string) {
  return request<{ message: string }>(`/projects/${id}`, { method: "DELETE" });
}

// Generation
export async function generateImage(prompt: string, options: { width?: number; height?: number; style?: string; plan?: string } = {}) {
  return request<{ task_id: string; status: string; credits: number }>("/generate/image", {
    method: "POST",
    body: JSON.stringify({ prompt, ...options }),
  });
}

export async function generateVideo(prompt: string, options: { duration?: number; style?: string } = {}) {
  return request<{ task_id: string; status: string; credits: number }>("/generate/video", {
    method: "POST",
    body: JSON.stringify({ prompt, ...options }),
  });
}

export async function styleTransfer(imageUrl: string, style: string, strength = 0.75) {
  return request<{ task_id: string; status: string; credits: number }>("/generate/style-transfer", {
    method: "POST",
    body: JSON.stringify({ image_url: imageUrl, style, strength }),
  });
}

export async function getGenerationStatus(taskId: string) {
  return request<{ task_id: string; type: string; status: string; result_url?: string; error?: string }>(
    `/generate/status/${taskId}`
  );
}

// ── 修图引擎（直连 Python 后端 /api/retouch）──────────────────────────────
const RETOUCH_BASE = "/api/retouch";

async function retouchRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("nova_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${RETOUCH_BASE}${path}`, { ...options, headers });
  const body = await res.json();
  if (!res.ok) {
    throw new NovaApiError(body.error || { code: res.status, message: body.detail || "Retouch error" });
  }
  return body as T;
}

export interface RetouchParseResult {
  ops: { name: string; strength: number; scope?: string }[];
  level: string;
  redlines: string[];
  questions: string[];
  warnings: string[];
  target: string;
}

export async function parseRetouchIntent(text: string) {
  return retouchRequest<RetouchParseResult>("/parse", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function retouchGate(text: string) {
  return retouchRequest<{ allowed: boolean; level?: string; redlines?: string[]; reason?: string }>("/gate", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

// Templates
export async function listTemplates(category?: string, limit = 20, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (category) params.set("category", category);
  return request<{ templates: any[]; total: number }>(`/templates?${params}`);
}

// Compliance
export async function checkCompliance(text: string) {
  return request<{ is_valid: boolean; violations: Array<{ keyword: string; category: string; suggestion: string }>; score: number }>(
    "/compliance/check",
    { method: "POST", body: JSON.stringify({ text }) }
  );
}

// Recipes
export async function listRecipes() {
    return request<{ recipes: Recipe[] }>("/recipes");
}

export async function saveRecipe(recipe: Recipe) {
    return request<Recipe>("/recipes", {
        method: "POST",
        body: JSON.stringify(recipe),
    });
}

export async function applyRecipe(id: string, values: Record<string, unknown> = {}) {
    return request<{ graph: Recipe["graph"] }>(`/recipes/${id}/apply`, {
        method: "POST",
        body: JSON.stringify({ values }),
    });
}

// Workflow execution
export async function runWorkflow(graph: WorkflowGraph, variables: Record<string, unknown> = {}) {
    return request<WorkflowRunResponse>("/workflows/run", {
        method: "POST",
        body: JSON.stringify({ nodes: graph.nodes, edges: graph.edges, variables }),
    });
}

// Chat (Agent)
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function chatCompletion(messages: ChatMessage[], scene: string) {
  return request<{ reply: string }>("/agent/chat", {
    method: "POST",
    body: JSON.stringify({ messages, scene }),
  });
}

export interface AIProvider {
  id: string;
  name: string;
  kind: string;
  base_url: string;
  model: string;
  enabled: boolean;
}

export async function listProviders(): Promise<AIProvider[]> {
  const data = await request<{ providers: AIProvider[] }>("/ai/providers");
  return data.providers || [];
}

export async function chatWithProvider(provider: string, messages: ChatMessage[]) {
  return request<{ reply: string; provider: string }>("/ai/chat", {
    method: "POST",
    body: JSON.stringify({ provider, messages }),
  });
}

export interface BatchImageResult {
  id: string;
  url: string;
  prompt: string;
  model: string;
}

export async function batchGenerateImages(params: { prompt: string; count?: number; style?: string }) {
  return request<{ images: BatchImageResult[] }>("/ai/batch-image", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface ScriptConfig {
  language: string;
  source: string;
  args?: string[];
  env?: Record<string, string>;
  permissions?: string[];
  limits?: {
    max_memory_mb?: number;
    max_cpu_percent?: number;
    max_execution_time?: number;
    max_output_size?: number;
  };
  working_dir?: string;
}

export interface ScriptDef {
  id: string;
  name: string;
  config: ScriptConfig;
}

export interface ScriptExecutionResult {
  task_id: string;
  status: string;
  exit_code: number;
  output: string;
  error: string;
  duration_ms: number;
  result?: Record<string, unknown>;
}

export async function listScripts(): Promise<ScriptDef[]> {
  const data = await request<{ scripts: ScriptDef[] }>("/scripts");
  return data.scripts || [];
}

export async function saveScript(name: string, config: ScriptConfig) {
  return request<ScriptDef>("/scripts", {
    method: "POST",
    body: JSON.stringify({ name, config }),
  });
}

export async function runScript(id: string) {
  return request<ScriptExecutionResult>(`/scripts/${id}/run`, {
    method: "POST",
    body: "{}",
  });
}

export async function runScriptInline(config: ScriptConfig) {
  return request<ScriptExecutionResult>("/scripts/run", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export interface VideoShot {
  index: number;
  prompt: string;
  image_url: string;
  duration: number;
}

export interface VideoCompositionResult {
  id: string;
  status: string;
  url: string;
  duration: number;
  voiceover: string;
  music: string;
  shots: VideoShot[];
}

export async function generateVideoComposition(params: {
  prompt?: string;
  duration?: number;
  shots?: string[];
  style?: string;
  voiceover?: string;
  music?: string;
}) {
  return request<VideoCompositionResult>("/ai/video", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface FissionVariant {
  index: number;
  hook: string;
  rhythm: string;
  shot: string;
  copy: string;
}

export interface FissionResult {
  id: string;
  status: string;
  reference: string;
  count: number;
  variants: FissionVariant[];
}

export async function generateFission(params: { reference: string; count?: number }) {
  return request<FissionResult>("/ai/fission", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface AdScene {
  shot: number;
  visual: string;
  voiceover: string;
  duration: number;
}

export interface AdScriptResult {
  id: string;
  status: string;
  brief: string;
  style: string;
  scenes: AdScene[];
}

export async function generateAdScript(params: { brief: string; style?: string; duration?: number }) {
  return request<AdScriptResult>("/ai/ad-script", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface DramaEpisode {
  index: number;
  title: string;
  outline: string;
  scenes: string[];
}

export interface DramaResult {
  id: string;
  status: string;
  synopsis: string;
  characters: string[];
  episodes: DramaEpisode[];
}

export async function generateDrama(params: { synopsis: string; episodes?: number }) {
  return request<DramaResult>("/ai/drama", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface ComplianceViolation {
  keyword: string;
  category: string;
  suggestion: string;
}

export interface ComplianceBatchItem {
  text: string;
  is_valid: boolean;
  violations: ComplianceViolation[];
  score: number;
}

export async function checkComplianceBatch(texts: string[]) {
  return request<{ results: ComplianceBatchItem[] }>("/compliance/check-batch", {
    method: "POST",
    body: JSON.stringify({ texts }),
  });
}

// Media Upload
export interface MediaUploadResult {
  url: string;
  storageKey: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: string;
}

export async function uploadMedia(file: File): Promise<MediaUploadResult> {
  const token = localStorage.getItem("nova_token");
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/media/upload`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const body = await res.json();

  if (!res.ok) {
    throw new NovaApiError(body.error || { code: res.status, message: "Upload failed" });
  }

  return body as MediaUploadResult;
}

// ── P2 会员/计费（直连 Python 后端 /api/billing，Bearer tok_<user_id>）──────
export interface BillingPlan {
  id: string;
  name_cn: string;
  name_en: string;
  price_cny_month: number;
  price_cny_year: number;
  features_cn: string[];
  features_en: string[];
  quota_images_month: number;
  quota_videos_month: number;
  quota_projects: number;
  quota_seats: number;
  highlight: boolean;
}

export interface BillingStatus {
  user_id: string;
  plan_id: string;
  plan_name_cn: string;
  status: string;
  period: string;
  started_at: number;
  expires_at: number | null;
  quota: { images_month: number; videos_month: number; projects: number; seats: number };
  used_this_month: number;
}

export interface BillingOrder {
  order_id: string;
  plan_id: string;
  period: string;
  amount_cny: number;
  status: string;
  created_at: number;
  paid_at: number | null;
  gateway_ref: string;
}

const BILLING_BASE = "/api/billing";

async function billingRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("nova_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${BILLING_BASE}${path}`, { ...options, headers });
  const body = await res.json();
  if (!res.ok) {
    throw new NovaApiError(body.error || { code: res.status, message: body.detail || "Billing error" });
  }
  return body as T;
}

export async function getBillingPlans(): Promise<BillingPlan[]> {
  const data = await billingRequest<{ plans: BillingPlan[] }>("/plans");
  return data.plans || [];
}

export async function getBillingStatus(): Promise<BillingStatus> {
  return billingRequest<BillingStatus>("/status");
}

export async function subscribePlan(plan_id: string, period: "monthly" | "yearly" = "monthly") {
  return billingRequest<{ order: BillingOrder; pay_url: string | null }>("/subscribe", {
    method: "POST",
    body: JSON.stringify({ plan_id, period }),
  });
}

export async function listBillingOrders(): Promise<BillingOrder[]> {
  const data = await billingRequest<{ orders: BillingOrder[] }>("/orders");
  return data.orders || [];
}

export async function payOrder(order_id: string, status: "paid" | "failed" | "refunded" = "paid", gateway_ref = "mock_gateway") {
  return billingRequest<{ order_id: string; status: string }>(`/webhook/${order_id}`, {
    method: "POST",
    body: JSON.stringify({ order_id, status, gateway_ref }),
  });
}

// ── P2 PSD 导出（直连 Python 后端 /api/export）──────────────────────────────
export interface PsdLayerInput {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  pixels_b64: string; // RGBA base64
  opacity?: number;
  visible?: boolean;
  blend_mode?: string;
}

export async function exportPsd(
  width: number,
  height: number,
  layers: PsdLayerInput[],
): Promise<Blob> {
  const token = localStorage.getItem("nova_token");
  const res = await fetch("/api/export/psd", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ width, height, layers }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new NovaApiError(body.error || { code: res.status, message: body.detail || "PSD export failed" });
  }
  return res.blob();
}

// ── P2 项目持久化（直连 Python 后端 /api/projects，Bearer tok_<user_id>）────
// 若 nova_token 不是 tok_ 格式则回退 mock（/api/v1/projects）
function useRealProjects(): boolean {
  const token = localStorage.getItem("nova_token");
  return !!token && token.startsWith("tok_");
}

export async function listProjectsReal(limit = 20, offset = 0) {
  const token = localStorage.getItem("nova_token");
  const res = await fetch(`/api/projects?limit=${limit}&offset=${offset}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json();
  if (!res.ok) throw new NovaApiError(body.error || { code: res.status, message: body.detail });
  return body as { projects: any[]; total: number };
}

export async function createProjectReal(name: string, scene: string, description = "") {
  const token = localStorage.getItem("nova_token");
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ name, scene, description }),
  });
  const body = await res.json();
  if (!res.ok) throw new NovaApiError(body.error || { code: res.status, message: body.detail });
  return body;
}

export async function updateProjectReal(id: string, data: { name?: string; canvas_data?: string; status?: string; description?: string }) {
  const token = localStorage.getItem("nova_token");
  const res = await fetch(`/api/projects/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new NovaApiError(body.error || { code: res.status, message: body.detail });
  return body;
}

export async function deleteProjectReal(id: string) {
  const token = localStorage.getItem("nova_token");
  const res = await fetch(`/api/projects/${id}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json();
  if (!res.ok) throw new NovaApiError(body.error || { code: res.status, message: body.detail });
  return body as { message: string };
}

/** 智能创建项目：有 tok_ token 走真实后端，否则回退 mock。 */
export async function createProjectSmart(name: string, scene: string, description = "") {
  if (useRealProjects()) {
    try {
      return await createProjectReal(name, scene, description);
    } catch {
      // 真实后端不可用时回退 mock
    }
  }
  return createProject(name, scene, description);
}

// SSE Streaming for Agent Chat
export interface ChatStreamCallbacks {
  onToken?: (token: string) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

export async function chatCompletionStream(
  messages: ChatMessage[],
  scene: string,
  callbacks: ChatStreamCallbacks
): Promise<void> {
  const token = localStorage.getItem("nova_token");

  const res = await fetch(`${API_BASE}/agent/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, scene }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new NovaApiError(body.error || { code: res.status, message: "Stream failed" });
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            callbacks.onDone?.();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.token) {
              callbacks.onToken?.(parsed.token);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
    callbacks.onDone?.();
  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error : new Error("Stream error"));
  }
}
