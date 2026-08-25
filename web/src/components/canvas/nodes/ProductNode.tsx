import React, { useState, useEffect } from "react";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

type ProductNodeProps = {
    node: CanvasNodeData;
    theme: (typeof import("@/lib/canvas-theme"))["canvasThemes"][keyof (typeof import("@/lib/canvas-theme"))["canvasThemes"]];
    isEditingContent: boolean;
    onContentChange: (nodeId: string, content: string) => void;
    onMetadataChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onStopEditing: () => void;
};

export function ProductNodeRenderer({ node, theme, isEditingContent, onContentChange, onMetadataChange, onStopEditing }: ProductNodeProps) {
    const metadata = node.metadata || {};
    const [productName, setProductName] = useState(metadata.productName || "");
    const [price, setPrice] = useState(metadata.price || "");
    const [sellingPoints, setSellingPoints] = useState<string[]>(metadata.sellingPoints || []);

    useEffect(() => {
        setProductName(metadata.productName || "");
        setPrice(metadata.price || "");
        setSellingPoints(metadata.sellingPoints || []);
    }, [metadata.productName, metadata.price, metadata.sellingPoints]);

    const saveToNode = () => {
        onMetadataChange(node.id, { productName, price, sellingPoints });
    };

    return (
        <div className="flex h-full w-full flex-col gap-2 p-3">
            <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: theme.node.muted }}>商品名称</span>
                {isEditingContent ? (
                    <input
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        onBlur={saveToNode}
                        className="flex-1 rounded border px-2 py-1 text-sm outline-none"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    />
                ) : (
                    <span className="flex-1 truncate text-sm font-medium" style={{ color: theme.node.text }}>{productName || "未命名商品"}</span>
                )}
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: theme.node.muted }}>价格</span>
                {isEditingContent ? (
                    <input
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        onBlur={saveToNode}
                        className="flex-1 rounded border px-2 py-1 text-sm outline-none"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    />
                ) : (
                    <span className="flex-1 truncate text-sm" style={{ color: theme.node.text }}>{price || "—"}</span>
                )}
            </div>
            <div className="flex flex-1 flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: theme.node.muted }}>卖点</span>
                {isEditingContent ? (
                    <textarea
                        value={sellingPoints.join("\n")}
                        onChange={(e) => setSellingPoints(e.target.value.split("\n").filter(Boolean))}
                        onBlur={saveToNode}
                        className="flex-1 resize-none rounded border px-2 py-1 text-xs outline-none"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                        placeholder="每行一个卖点"
                    />
                ) : (
                    <ul className="flex-1 space-y-1 overflow-y-auto">
                        {sellingPoints.length > 0 ? (
                            sellingPoints.map((point, idx) => (
                                <li key={idx} className="text-xs" style={{ color: theme.node.text }}>• {point}</li>
                            ))
                        ) : (
                            <li className="text-xs" style={{ color: theme.node.muted }}>暂无卖点</li>
                        )}
                    </ul>
                )}
            </div>
        </div>
    );
}