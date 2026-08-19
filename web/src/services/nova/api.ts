const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";

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
