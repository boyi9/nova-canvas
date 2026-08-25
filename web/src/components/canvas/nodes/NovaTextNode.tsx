import React, { useRef, useState, useEffect, useCallback } from "react";
import type { CanvasNode, ViewportTransform } from "@/types/canvas";

interface NovaTextNodeProps {
  node: CanvasNode;
  onUpdate: (data: Partial<CanvasNode["data"]>) => void;
  selected: boolean;
  viewport: ViewportTransform;
}

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 48];
const FONT_COLORS = [
  "#000000", "#333333", "#666666", "#999999",
  "#ff0000", "#ff7f00", "#ffff00", "#00ff00",
  "#00ffff", "#0000ff", "#8b00ff", "#ff00ff",
  "#ffffff", "#cccccc", "#888888", "#444444"
];

export function NovaTextNode({ node, onUpdate, selected, viewport }: NovaTextNodeProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState<string>(node.data?.textContent || "");
  const [fontSize, setFontSize] = useState<number>(node.data?.fontSize || 16);
  const [fontColor, setFontColor] = useState<string>(node.data?.fontColor || "#000000");
  const [isBold, setIsBold] = useState<boolean>(node.data?.isBold || false);
  const [isItalic, setIsItalic] = useState<boolean>(node.data?.isItalic || false);
  const [isUnderline, setIsUnderline] = useState<boolean>(node.data?.isUnderline || false);

  // 同步节点数据到本地状态
  useEffect(() => {
    if (node.data) {
      setText(node.data.textContent || "");
      setFontSize(node.data.fontSize || 16);
      setFontColor(node.data.fontColor || "#000000");
      setIsBold(node.data.isBold || false);
      setIsItalic(node.data.isItalic || false);
      setIsUnderline(node.data.isUnderline || false);
    }
  }, [node.data]);

  // 保存到节点
  const saveToNode = useCallback(() => {
    onUpdate({
      textContent: text,
      fontSize,
      fontColor,
      isBold,
      isItalic,
      isUnderline,
    });
  }, [onUpdate, text, fontSize, fontColor, isBold, isItalic, isUnderline]);

  // 防抖保存
  useEffect(() => {
    const timer = setTimeout(saveToNode, 300);
    return () => clearTimeout(timer);
  }, [text, fontSize, fontColor, isBold, isItalic, isUnderline, saveToNode]);

  // 格式化命令
  const executeFormat = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    
    // 更新本地状态
    if (command === "bold") setIsBold(!isBold);
    else if (command === "italic") setIsItalic(!isItalic);
    else if (command === "underline") setIsUnderline(!isUnderline);
    else if (command === "fontSize" && value) setFontSize(parseInt(value));
    else if (command === "foreColor" && value) setFontColor(value);
  };

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isEditing) return;
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
  }, [isEditing]);

  // 点击外部关闭工具栏
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node) &&
          editorRef.current && !editorRef.current.contains(e.target as Node)) {
        setIsEditing(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isEditing]);

  const scale = viewport.k;
  const nodeStyle: React.CSSProperties = {
    position: "absolute",
    left: `${node.position.x}px`,
    top: `${node.position.y}px`,
    width: `${node.size.width}px`,
    height: `${node.size.height}px`,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
    fontSize: `${fontSize / scale}px`,
    color: fontColor,
    fontWeight: isBold ? "bold" : "normal",
    fontStyle: isItalic ? "italic" : "normal",
    textDecoration: isUnderline ? "underline" : "none",
    border: selected ? `2px solid #1890ff` : "1px solid transparent",
    borderRadius: "4px",
    background: "white",
    boxShadow: selected ? "0 2px 8px rgba(24,144,255,0.3)" : "none",
    zIndex: selected ? 10 : 1,
    cursor: isEditing ? "text" : "move",
    overflow: "hidden",
  };

  const editorStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    padding: "8px",
    outline: "none",
    minHeight: "100%",
    boxSizing: "border-box",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
  };

  const toolbarStyle: React.CSSProperties = {
    position: "absolute",
    top: "-40px",
    left: "0",
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    padding: "4px",
    background: "white",
    border: "1px solid #d9d9d9",
    borderRadius: "4px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    zIndex: 100,
    width: "max-content",
    maxWidth: "300px",
  };

  return (
    <div
      style={nodeStyle}
      onClick={() => setIsEditing(true)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      {isEditing && (
        <div ref={toolbarRef} style={toolbarStyle}>
          <button type="button" onClick={() => executeFormat("bold")} style={{fontWeight: isBold ? "bold" : "normal"}} title="加粗 (Ctrl+B)">B</button>
          <button type="button" onClick={() => executeFormat("italic")} style={{fontStyle: isItalic ? "italic" : "normal"}} title="斜体 (Ctrl+I)">I</button>
          <button type="button" onClick={() => executeFormat("underline")} style={{textDecoration: isUnderline ? "underline" : "none"}} title="下划线 (Ctrl+U)">U</button>
          <span style={{width: "1px", height: "20px", background: "#d9d9d9", margin: "0 4px"}} />
          <select value={fontSize} onChange={(e) => executeFormat("fontSize", e.target.value)} style={{width: "60px", fontSize: "12px"}}>
            {FONT_SIZES.map(size => <option key={size} value={size}>{size}px</option>)}
          </select>
          <input type="color" value={fontColor} onChange={(e) => executeFormat("foreColor", e.target.value)} style={{width: "28px", height: "28px", border: "none", cursor: "pointer"}} title="字体颜色" />
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable={isEditing}
        suppressContentEditableWarning
        style={editorStyle}
        onInput={(e) => setText(e.currentTarget.innerText)}
        onBlur={() => { setTimeout(() => setIsEditing(false), 100); }}
        dangerouslySetInnerHTML={{ __html: text.replace(/\n/g, "<br>") }}
      />
    </div>
  );
}