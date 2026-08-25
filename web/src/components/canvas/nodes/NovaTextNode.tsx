import React, { useRef, useState, useEffect, useCallback } from "react";
import type { CanvasNodeData } from "@/types/canvas";
import type { canvasThemes } from "@/lib/canvas-theme";

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 48];
const FONT_COLORS = [
  "#000000", "#333333", "#666666", "#999999",
  "#ff0000", "#ff7f00", "#ffff00", "#00ff00",
  "#00ffff", "#0000ff", "#8b00ff", "#ff00ff",
  "#ffffff", "#cccccc", "#888888", "#444444"
];

type NovaTextNodeRendererProps = {
  node: CanvasNodeData;
  theme: (typeof canvasThemes)[keyof typeof canvasThemes];
  isEditingContent: boolean;
  onContentChange: (nodeId: string, content: string) => void;
  onStopEditing: () => void;
};

export function NovaTextNodeRenderer({
  node,
  theme,
  isEditingContent,
  onContentChange,
  onStopEditing,
}: NovaTextNodeRendererProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState<string>(node.metadata?.content || "");
  const [fontSize, setFontSize] = useState<number>(node.metadata?.fontSize || 16);
  const [fontColor, setFontColor] = useState<string>("#000000");
  const [isBold, setIsBold] = useState<boolean>(false);
  const [isItalic, setIsItalic] = useState<boolean>(false);
  const [isUnderline, setIsUnderline] = useState<boolean>(false);

  useEffect(() => {
    setText(node.metadata?.content || "");
  }, [node.metadata?.content]);

  const saveToNode = useCallback(() => {
    onContentChange(node.id, text);
  }, [onContentChange, node.id, text]);

  useEffect(() => {
    const timer = setTimeout(saveToNode, 300);
    return () => clearTimeout(timer);
  }, [text, saveToNode]);

  const executeFormat = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (command === "bold") setIsBold(!isBold);
    else if (command === "italic") setIsItalic(!isItalic);
    else if (command === "underline") setIsUnderline(!isUnderline);
    else if (command === "fontSize" && value) setFontSize(parseInt(value));
    else if (command === "foreColor" && value) setFontColor(value);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isEditingContent) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        executeFormat("bold");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "i") {
        e.preventDefault();
        executeFormat("italic");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "u") {
        e.preventDefault();
        executeFormat("underline");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditingContent]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node) &&
          editorRef.current && !editorRef.current.contains(e.target as Node)) {
        onStopEditing();
      }
    };
    if (isEditingContent) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isEditingContent, onStopEditing]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden pt-8">
      {isEditingContent && (
        <div
          ref={toolbarRef}
          className="absolute left-2 top-2 z-20 flex flex-wrap gap-1 rounded-lg border p-1 shadow-md"
          style={{
            background: theme.toolbar.panel,
            borderColor: theme.toolbar.border,
          }}
        >
          <button
            type="button"
            className="px-2 py-1 text-xs font-bold"
            style={{
              background: isBold ? theme.toolbar.activeBg : "transparent",
              color: theme.node.text,
            }}
            onClick={() => executeFormat("bold")}
            title="加粗 (Ctrl+B)"
          >
            B
          </button>
          <button
            type="button"
            className="px-2 py-1 text-xs italic"
            style={{
              background: isItalic ? theme.toolbar.activeBg : "transparent",
              color: theme.node.text,
            }}
            onClick={() => executeFormat("italic")}
            title="斜体 (Ctrl+I)"
          >
            I
          </button>
          <button
            type="button"
            className="px-2 py-1 text-xs underline"
            style={{
              background: isUnderline ? theme.toolbar.activeBg : "transparent",
              color: theme.node.text,
            }}
            onClick={() => executeFormat("underline")}
            title="下划线 (Ctrl+U)"
          >
            U
          </button>
          <span className="mx-1 w-px self-stretch" style={{ background: theme.toolbar.border }} />
          <select
            value={fontSize}
            onChange={(e) => executeFormat("fontSize", e.target.value)}
            className="w-14 text-xs"
            style={{ background: theme.toolbar.panel, color: theme.node.text }}
          >
            {FONT_SIZES.map((size) => (
              <option key={size} value={size}>{size}px</option>
            ))}
          </select>
          <input
            type="color"
            value={fontColor}
            onChange={(e) => executeFormat("foreColor", e.target.value)}
            className="size-7 cursor-pointer border-none"
            title="字体颜色"
          />
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable={isEditingContent}
        suppressContentEditableWarning
        className="thin-scrollbar block h-full w-full resize-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent pl-4 pr-14 pt-0 pb-4 font-mono outline-none select-text"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: `${Math.round(fontSize * 1.65)}px`,
          color: theme.node.text,
          fontWeight: isBold ? "bold" : "normal",
          fontStyle: isItalic ? "italic" : "normal",
          textDecoration: isUnderline ? "underline" : "none",
          boxSizing: "border-box",
        }}
        onInput={(e) => setText(e.currentTarget.innerText)}
        onBlur={() => onStopEditing()}
        dangerouslySetInnerHTML={{ __html: text.replace(/\n/g, "<br>") }}
      />
    </div>
  );
}