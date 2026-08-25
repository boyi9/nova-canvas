import React, { useState, useEffect } from "react";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import { WorkflowResultView } from "./workflow-result-badge";

type VideoTrackNodeProps = {
    node: CanvasNodeData;
    theme: (typeof import("@/lib/canvas-theme"))["canvasThemes"][keyof (typeof import("@/lib/canvas-theme"))["canvasThemes"]];
    isEditingContent: boolean;
    onContentChange: (nodeId: string, content: string) => void;
    onMetadataChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onStopEditing: () => void;
};

export function VideoTrackNodeRenderer({ node, theme, isEditingContent, onContentChange, onMetadataChange, onStopEditing }: VideoTrackNodeProps) {
    const metadata = node.metadata || {};
    const [clips, setClips] = useState<string[]>(metadata.clips || []);
    const [duration, setDuration] = useState(metadata.duration || 0);

    useEffect(() => {
        setClips(metadata.clips || []);
        setDuration(metadata.duration || 0);
    }, [metadata.clips, metadata.duration]);

    const saveToNode = () => {
        onMetadataChange(node.id, { clips, duration });
    };

    return (
        <div className="flex h-full w-full flex-col gap-2 p-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: theme.node.muted }}>视频轨道</span>
                {isEditingContent ? (
                    <input
                        type="number"
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                        onBlur={saveToNode}
                        className="w-16 rounded border px-1 py-0.5 text-xs outline-none"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    />
                ) : (
                    <span className="text-xs" style={{ color: theme.node.text }}>{duration}s</span>
                )}
            </div>
            <div className="flex flex-1 items-center gap-1 overflow-x-auto">
                {clips.length > 0 ? (
                    clips.map((clip, idx) => (
                        <div key={idx} className="flex h-full min-w-16 shrink-0 items-center justify-center rounded border px-2 text-xs" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                            {clip}
                        </div>
                    ))
                ) : (
                    <div className="text-xs" style={{ color: theme.node.muted }}>拖入视频片段</div>
                )}
            </div>
            <WorkflowResultView result={metadata.workflowResult} />
        </div>
    );
}