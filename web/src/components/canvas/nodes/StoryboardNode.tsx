import React, { useState, useEffect } from "react";
import type { CanvasNodeData } from "@/types/canvas";

type StoryboardNodeProps = {
    node: CanvasNodeData;
    theme: (typeof import("@/lib/canvas-theme"))["canvasThemes"][keyof (typeof import("@/lib/canvas-theme"))["canvasThemes"]];
    isEditingContent: boolean;
    onContentChange: (nodeId: string, content: string) => void;
    onStopEditing: () => void;
};

export function StoryboardNodeRenderer({ node, theme, isEditingContent, onContentChange, onStopEditing }: StoryboardNodeProps) {
    const metadata = node.metadata || {};
    const [scenes, setScenes] = useState<string[]>(metadata.scenes || []);

    useEffect(() => {
        setScenes(metadata.scenes || []);
    }, [metadata.scenes]);

    const saveToNode = () => {
        const content = JSON.stringify({ scenes });
        onContentChange(node.id, content);
    };

    return (
        <div className="flex h-full w-full flex-col gap-2 p-3">
            <span className="text-xs font-medium" style={{ color: theme.node.muted }}>分镜脚本</span>
            {isEditingContent ? (
                <textarea
                    value={scenes.join("\n")}
                    onChange={(e) => setScenes(e.target.value.split("\n").filter(Boolean))}
                    onBlur={saveToNode}
                    className="flex-1 resize-none rounded border px-2 py-1 text-xs outline-none"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    placeholder="每行一个分镜：场景描述 / 运镜 / 台词"
                />
            ) : (
                <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
                    {scenes.length > 0 ? (
                        scenes.map((scene, idx) => (
                            <div key={idx} className="rounded border px-2 py-1 text-xs" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                                <span style={{ color: theme.node.muted }}>#{idx + 1}</span> {scene}
                            </div>
                        ))
                    ) : (
                        <div className="text-xs" style={{ color: theme.node.muted }}>暂无分镜</div>
                    )}
                </div>
            )}
        </div>
    );
}