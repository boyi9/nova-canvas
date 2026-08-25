import React, { useState, useEffect } from "react";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

type RecipeNodeProps = {
    node: CanvasNodeData;
    theme: (typeof import("@/lib/canvas-theme"))["canvasThemes"][keyof (typeof import("@/lib/canvas-theme"))["canvasThemes"]];
    isEditingContent: boolean;
    onContentChange: (nodeId: string, content: string) => void;
    onMetadataChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onStopEditing: () => void;
};

export function RecipeNodeRenderer({ node, theme, isEditingContent, onContentChange, onMetadataChange, onStopEditing }: RecipeNodeProps) {
    const metadata = node.metadata || {};
    const [recipeName, setRecipeName] = useState(metadata.recipeName || "");
    const [params, setParams] = useState<Record<string, string>>(metadata.params || {});

    useEffect(() => {
        setRecipeName(metadata.recipeName || "");
        setParams(metadata.params || {});
    }, [metadata.recipeName, metadata.params]);

    const saveToNode = () => {
        onMetadataChange(node.id, { recipeName, params });
    };

    const updateParam = (key: string, value: string) => {
        setParams((prev) => ({ ...prev, [key]: value }));
    };

    return (
        <div className="flex h-full w-full flex-col gap-2 p-3">
            <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: theme.node.muted }}>配方名称</span>
                {isEditingContent ? (
                    <input
                        value={recipeName}
                        onChange={(e) => setRecipeName(e.target.value)}
                        onBlur={saveToNode}
                        className="flex-1 rounded border px-2 py-1 text-sm outline-none"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                        placeholder="如：电商主图-美妆风"
                    />
                ) : (
                    <span className="flex-1 truncate text-sm font-medium" style={{ color: theme.node.text }}>{recipeName || "未命名配方"}</span>
                )}
            </div>
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
                <span className="text-xs font-medium" style={{ color: theme.node.muted }}>参数</span>
                {Object.entries(params).length > 0 ? (
                    Object.entries(params).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2">
                            <span className="w-20 truncate text-xs" style={{ color: theme.node.muted }}>{key}</span>
                            {isEditingContent ? (
                                <input
                                    value={value}
                                    onChange={(e) => updateParam(key, e.target.value)}
                                    onBlur={saveToNode}
                                    className="flex-1 rounded border px-2 py-0.5 text-xs outline-none"
                                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                                />
                            ) : (
                                <span className="flex-1 truncate text-xs" style={{ color: theme.node.text }}>{value}</span>
                            )}
                        </div>
                    ))
                ) : (
                    <span className="text-xs" style={{ color: theme.node.muted }}>暂无参数</span>
                )}
            </div>
        </div>
    );
}