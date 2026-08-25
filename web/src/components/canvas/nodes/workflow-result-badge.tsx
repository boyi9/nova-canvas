import type { CanvasNodeMetadata } from "@/types/canvas";

function formatValue(value: unknown): string {
    if (value == null) return "";
    if (Array.isArray(value)) return value.map((item) => String(item)).join("、");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

export function WorkflowResultView({ result }: { result?: Record<string, unknown> }) {
    if (!result) return null;
    const entries = Object.entries(result).filter(
        ([, value]) => value != null && !(Array.isArray(value) && value.length === 0) && value !== "",
    );
    if (!entries.length) return null;
    return (
        <div className="mt-2 rounded-lg border border-dashed p-2 text-xs" style={{ borderColor: "rgba(120,113,108,.3)" }}>
            <div className="mb-1 opacity-60">运行结果</div>
            <div className="space-y-0.5">
                {entries.map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                        <span className="shrink-0 opacity-60">{key}:</span>
                        <span className="min-w-0 flex-1 break-words">{formatValue(value)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export type { CanvasNodeMetadata };
