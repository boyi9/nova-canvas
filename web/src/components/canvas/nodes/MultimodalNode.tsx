import React, { useState, useEffect } from "react";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import { WorkflowResultView } from "./workflow-result-badge";

type MultimodalNodeProps = {
    node: CanvasNodeData;
    theme: (typeof import("@/lib/canvas-theme"))["canvasThemes"][keyof (typeof import("@/lib/canvas-theme"))["canvasThemes"]];
    isEditingContent: boolean;
    onContentChange: (nodeId: string, content: string) => void;
    onMetadataChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onStopEditing: () => void;
};

const MODALITY_OPTIONS = ["image", "video", "audio", "text"];

export function MultimodalNodeRenderer({ node, theme, isEditingContent, onContentChange, onMetadataChange, onStopEditing }: MultimodalNodeProps) {
    const metadata = node.metadata || {};
    const [modalities, setModalities] = useState<string[]>(metadata.modalities || []);

    useEffect(() => {
        setModalities(metadata.modalities || []);
    }, [metadata.modalities]);

    const toggleModality = (modality: string) => {
        setModalities((prev) => {
            const next = prev.includes(modality) ? prev.filter((m) => m !== modality) : [...prev, modality];
            onMetadataChange(node.id, { modalities: next });
            return next;
        });
    };

    return (
        <div className="flex h-full w-full flex-col gap-2 p-3">
            <span className="text-xs font-medium" style={{ color: theme.node.muted }}>多模态输入</span>
            <div className="flex flex-1 flex-col gap-1">
                {MODALITY_OPTIONS.map((modality) => (
                    <button
                        key={modality}
                        type="button"
                        disabled={!isEditingContent}
                        onClick={() => toggleModality(modality)}
                        className="flex items-center gap-2 rounded border px-2 py-1 text-xs transition"
                        style={{
                            background: modalities.includes(modality) ? theme.toolbar.activeBg : theme.toolbar.panel,
                            borderColor: theme.toolbar.border,
                            color: theme.node.text,
                            cursor: isEditingContent ? "pointer" : "default",
                        }}
                    >
                        <span className={`h-2 w-2 rounded-full ${modalities.includes(modality) ? "bg-green-500" : "bg-gray-400"}`} />
                        {modality}
                    </button>
                ))}
            </div>
            <WorkflowResultView result={metadata.workflowResult} />
        </div>
    );
}