import {
    NovaSDKConfig,
    NovaSDKError,
    type ChatMessage,
    type AIProvider,
    type BatchImageResult,
    type ScriptConfig,
    type ScriptDef,
    type ScriptExecutionResult,
    type VideoCompositionResult,
    type FissionResult,
    type AdScriptResult,
    type DramaResult,
    type ComplianceViolation,
    type ComplianceBatchItem,
    type Recipe,
    type WorkflowGraph,
    type WorkflowRunResponse,
} from "./types";

interface ApiErrorShape {
    error?: { code?: number; message?: string; detail?: string };
}

/**
 * Framework-agnostic client for the Nova Canvas backend.
 *
 * It mirrors every endpoint used by the web app but is decoupled from React:
 * pass a custom `baseUrl`, `getToken`, and `fetchImpl` (useful for tests or
 * non-browser runtimes).
 */
export class NovaSDK {
    private readonly baseUrl: string;
    private readonly getToken: () => string | null;
    private readonly fetchImpl: typeof fetch;

    constructor(config: NovaSDKConfig = {}) {
        this.baseUrl =
            config.baseUrl ??
            (import.meta.env?.VITE_API_URL as string | undefined) ??
            "/api/v1";
        this.getToken =
            config.getToken ??
            (() =>
                typeof localStorage !== "undefined"
                    ? localStorage.getItem("nova_token")
                    : null);
        this.fetchImpl = config.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    }

    private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
        const token = this.getToken();
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers as Record<string, string> | undefined),
        };
        const res = await this.fetchImpl(`${this.baseUrl}${path}`, { ...options, headers });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorShape;
        if (!res.ok) {
            const err = body.error ?? {};
            throw new NovaSDKError(res.status, err.message ?? "Unknown error", err.detail);
        }
        return body as T;
    }

    // ----- Auth -----
    register(email: string, password: string, name: string) {
        return this.request<{ user: unknown; token: string }>("/auth/register", {
            method: "POST",
            body: JSON.stringify({ email, password, name }),
        });
    }

    login(email: string, password: string) {
        return this.request<{ user: unknown; token: string }>("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
        });
    }

    // ----- Projects -----
    listProjects(limit = 20, offset = 0) {
        return this.request<{ projects: unknown[]; total: number }>(
            `/projects?limit=${limit}&offset=${offset}`,
        );
    }

    createProject(name: string, scene: string, description = "") {
        return this.request<unknown>("/projects", {
            method: "POST",
            body: JSON.stringify({ name, scene, description }),
        });
    }

    updateProject(id: string, data: { name?: string; canvas_data?: string; status?: string }) {
        return this.request<unknown>(`/projects/${id}`, {
            method: "PUT",
            body: JSON.stringify(data),
        });
    }

    deleteProject(id: string) {
        return this.request<{ message: string }>(`/projects/${id}`, { method: "DELETE" });
    }

    // ----- Templates -----
    listTemplates(category?: string, limit = 20, offset = 0) {
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (category) params.set("category", category);
        return this.request<{ templates: unknown[]; total: number }>(`/templates?${params}`);
    }

    // ----- Generation -----
    generateImage(prompt: string, options: { width?: number; height?: number; style?: string; plan?: string } = {}) {
        return this.request<{ task_id: string; status: string; credits: number }>("/generate/image", {
            method: "POST",
            body: JSON.stringify({ prompt, ...options }),
        });
    }

    generateVideo(prompt: string, options: { duration?: number; style?: string } = {}) {
        return this.request<{ task_id: string; status: string; credits: number }>("/generate/video", {
            method: "POST",
            body: JSON.stringify({ prompt, ...options }),
        });
    }

    styleTransfer(imageUrl: string, style: string, strength = 0.75) {
        return this.request<{ task_id: string; status: string; credits: number }>("/generate/style-transfer", {
            method: "POST",
            body: JSON.stringify({ image_url: imageUrl, style, strength }),
        });
    }

    getGenerationStatus(taskId: string) {
        return this.request<{ task_id: string; type: string; status: string; result_url?: string; error?: string }>(
            `/generate/status/${taskId}`,
        );
    }

    // ----- Compliance -----
    checkCompliance(text: string) {
        return this.request<{ is_valid: boolean; violations: ComplianceViolation[]; score: number }>(
            "/compliance/check",
            { method: "POST", body: JSON.stringify({ text }) },
        );
    }

    checkComplianceBatch(texts: string[]) {
        return this.request<{ results: ComplianceBatchItem[] }>("/compliance/check-batch", {
            method: "POST",
            body: JSON.stringify({ texts }),
        });
    }

    // ----- Recipes -----
    listRecipes() {
        return this.request<{ recipes: Recipe[] }>("/recipes");
    }

    saveRecipe(recipe: Recipe) {
        return this.request<Recipe>("/recipes", { method: "POST", body: JSON.stringify(recipe) });
    }

    applyRecipe(id: string, values: Record<string, unknown> = {}) {
        return this.request<{ graph: Recipe["graph"] }>(`/recipes/${id}/apply`, {
            method: "POST",
            body: JSON.stringify({ values }),
        });
    }

    // ----- Workflows -----
    runWorkflow(graph: WorkflowGraph, variables: Record<string, unknown> = {}) {
        return this.request<WorkflowRunResponse>("/workflows/run", {
            method: "POST",
            body: JSON.stringify({ nodes: graph.nodes, edges: graph.edges, variables }),
        });
    }

    // ----- Agent chat -----
    chatCompletion(messages: ChatMessage[], scene: string) {
        return this.request<{ reply: string }>("/agent/chat", {
            method: "POST",
            body: JSON.stringify({ messages, scene }),
        });
    }

    // ----- AI -----
    listProviders(): Promise<AIProvider[]> {
        return this.request<{ providers: AIProvider[] }>("/ai/providers").then((d) => d.providers ?? []);
    }

    chatWithProvider(provider: string, messages: ChatMessage[]) {
        return this.request<{ reply: string; provider: string }>("/ai/chat", {
            method: "POST",
            body: JSON.stringify({ provider, messages }),
        });
    }

    batchGenerateImages(params: { prompt: string; count?: number; style?: string }) {
        return this.request<{ images: BatchImageResult[] }>("/ai/batch-image", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }

    generateVideoComposition(params: {
        prompt?: string;
        duration?: number;
        shots?: string[];
        style?: string;
        voiceover?: string;
        music?: string;
    }) {
        return this.request<VideoCompositionResult>("/ai/video", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }

    generateFission(params: { reference: string; count?: number }) {
        return this.request<FissionResult>("/ai/fission", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }

    generateAdScript(params: { brief: string; style?: string; duration?: number }) {
        return this.request<AdScriptResult>("/ai/ad-script", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }

    generateDrama(params: { synopsis: string; episodes?: number }) {
        return this.request<DramaResult>("/ai/drama", {
            method: "POST",
            body: JSON.stringify(params),
        });
    }

    // ----- Scripts -----
    listScripts(): Promise<ScriptDef[]> {
        return this.request<{ scripts: ScriptDef[] }>("/scripts").then((d) => d.scripts ?? []);
    }

    saveScript(name: string, config: ScriptConfig) {
        return this.request<ScriptDef>("/scripts", { method: "POST", body: JSON.stringify({ name, config }) });
    }

    runScript(id: string) {
        return this.request<ScriptExecutionResult>(`/scripts/${id}/run`, { method: "POST", body: "{}" });
    }

    runScriptInline(config: ScriptConfig) {
        return this.request<ScriptExecutionResult>("/scripts/run", {
            method: "POST",
            body: JSON.stringify(config),
        });
    }
}
