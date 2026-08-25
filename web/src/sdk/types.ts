export type { Recipe } from "@/lib/canvas/recipe-adapter";
export type { WorkflowGraph, WorkflowRunResponse } from "@/lib/canvas/workflow-run";
export type {
    ChatMessage,
    AIProvider,
    BatchImageResult,
    ScriptConfig,
    ScriptDef,
    ScriptExecutionResult,
    VideoShot,
    VideoCompositionResult,
    FissionVariant,
    FissionResult,
    AdScene,
    AdScriptResult,
    DramaEpisode,
    DramaResult,
    ComplianceViolation,
    ComplianceBatchItem,
} from "@/services/nova/api";

export interface NovaSDKConfig {
    baseUrl?: string;
    getToken?: () => string | null;
    fetchImpl?: typeof fetch;
}

export class NovaSDKError extends Error {
    code: number;
    detail?: string;
    constructor(code: number, message: string, detail?: string) {
        super(message);
        this.name = "NovaSDKError";
        this.code = code;
        this.detail = detail;
    }
}
