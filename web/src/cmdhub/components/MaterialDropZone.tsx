import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** 从 File 数组构造最小可用的拖拽事件（浏览器原生 DataTransfer 不可构造）。 */
function filesToDropEvent(files: File[]): React.DragEvent {
  return {
    preventDefault: () => {},
    stopPropagation: () => {},
    dataTransfer: { files } as unknown as DataTransfer,
  } as React.DragEvent;
}

export interface MaterialItem {
  id: string;
  name: string;
  type: "image" | "video" | "audio" | "document";
  url: string;
  thumbnail?: string;
  size: number;
  mimeType: string;
}

interface MaterialDropZoneProps {
  materials: MaterialItem[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onReorder: (items: MaterialItem[]) => void;
  maxFiles?: number;
  acceptedTypes?: string[];
  disabled?: boolean;
}

const ACCEPTED = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/wav", "audio/ogg"],
  document: ["application/pdf", "application/json"],
};

export function MaterialDropZone({
  materials,
  onAdd,
  onRemove,
  onReorder,
  maxFiles = 20,
  acceptedTypes = ["image/*", "video/*", "audio/*"],
  disabled = false,
}: MaterialDropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const getFileType = (file: File): "image" | "video" | "audio" | "document" => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return "document";
  };

  const validateFile = (file: File): string | null => {
    const valid = acceptedTypes.some((t) => {
      if (t.endsWith("/*")) return file.type.startsWith(t.replace("/*", "/"));
      return file.type === t;
    });
    if (!valid) return `不支持的文件类型: ${file.type}`;
    if (file.size > 500 * 1024 * 1024) return `文件过大: ${(file.size / 1024 / 1024).toFixed(1)}MB (最大 500MB)`;
    return null;
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragActive(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有真正离开容器时才取消
    if (dropzoneRef.current && !dropzoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragActive(false);
      setDragPosition(null);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    const rect = dropzoneRef.current?.getBoundingClientRect();
    if (rect) {
      setDragPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    e.dataTransfer.dropEffect = "copy";
  }, [disabled]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    setDragPosition(null);
    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const err = validateFile(file);
      if (err) errors.push(`${file.name}: ${err}`);
      else validFiles.push(file);
    }

    if (errors.length > 0) {
      alert(errors.join("\n"));
    }
    if (validFiles.length > 0) {
      if (materials.length + validFiles.length > maxFiles) {
        alert(`超出最大文件数 ${maxFiles}`);
        return;
      }
      onAdd(validFiles);
    }
  }, [disabled, materials.length, maxFiles, onAdd]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    handleDrop(filesToDropEvent(files));
    e.target.value = "";
  }, [handleDrop]);

  const generateId = () => `mat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // 处理粘贴
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (disabled) return;
      const items = Array.from(e.clipboardData?.items ?? []);
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        handleDrop(filesToDropEvent(files));
      }
    };
    const el = dropzoneRef.current;
    el?.addEventListener("paste", handlePaste);
    return () => el?.removeEventListener("paste", handlePaste);
  }, [disabled, handleDrop]);

  const totalSize = materials.reduce((sum, m) => sum + m.size, 0);

  return (
    <div
      ref={dropzoneRef}
      className={cn(
        "relative rounded-xl border-2 transition-all duration-200",
        disabled
          ? "border-gray-200 bg-gray-50 cursor-not-allowed"
          : isDragActive
          ? "border-blue-500 bg-blue-50 ring-2 ring-ring/20"
          : "border-gray-200 hover:border-blue-400 bg-white"
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      tabIndex={0}
      role="dropzone"
      aria-label="素材拖拽区域"
    >
      {/* 隐藏文件输入 */}
      <input
        type="file"
        multiple
        accept={acceptedTypes.join(",")}
        onChange={handleFileSelect}
        className="absolute inset-0 opacity-0 pointer-events-none"
        id="material-upload"
        disabled={disabled || materials.length >= maxFiles}
      />

      {/* 拖拽提示/空状态 */}
      {materials.length === 0 && (
        <label
          htmlFor="material-upload"
          className={cn(
            "flex flex-col items-center justify-center p-8 text-center cursor-pointer",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4", isDragActive ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-muted-foreground")}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p className="text-lg font-medium text-gray-700">拖拽素材到这里</p>
          <p className="text-sm text-muted-foreground mt-1">或点击上传 · 支持图片/视频/音频</p>
          <p className="text-xs text-muted-foreground mt-2">最多 {maxFiles} 个文件 · 单个 ≤ 500MB</p>
        </label>
      )}

      {/* 素材网格 */}
      {materials.length > 0 && (
        <>
          <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {materials.length} 个素材 · 总计 {(totalSize / 1024 / 1024).toFixed(1)} MB
            </span>
            <label
              htmlFor="material-upload"
              className={cn("px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 cursor-pointer", disabled && "opacity-50 cursor-not-allowed")}
            >
              + 添加更多
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3 max-h-96 overflow-y-auto">
            {materials.map((material, index) => (
              <div
                key={material.id}
                className={cn(
                  "relative group bg-white rounded-lg border overflow-hidden shadow-sm transition-shadow",
                  "hover:shadow-md"
                )}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                {/* 缩略图/预览 */}
                <div className="aspect-video relative bg-gray-100 overflow-hidden">
                  {material.type === "image" && material.thumbnail && (
                    <img
                      src={material.thumbnail}
                      alt={material.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                  {material.type === "video" && (
                    <>
                      {material.thumbnail ? (
                        <img src={material.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-200">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </div>
                      )}
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-foreground text-[10px] font-mono rounded">
                        {material.name}
                      </div>
                    </>
                  )}
                  {material.type === "audio" && (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                        <path d="M9 18V5l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                      </svg>
                    </div>
                  )}
                  {material.type === "document" && (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                  )}

                  {/* 拖拽排序手柄 */}
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground hover:text-muted-foreground cursor-grab active:cursor-grabbing">
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                  </div>

                  {/* 删除按钮 */}
                  <button
                    type="button"
                    onClick={() => onRemove(material.id)}
                    className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-100 text-red-500"
                    title="移除"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>

                {/* 信息 */}
                <div className="p-2 space-y-1 min-h-[60px]">
                  <p className="text-xs font-medium text-gray-900 truncate" title={material.name}>
                    {material.name}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-muted-foreground font-medium uppercase">
                      {material.type}
                    </span>
                    <span className="font-mono">{(material.size / 1024).toFixed(1)} KB</span>
                  </div>
                </div>

                {/* 预览放大 */}
                {previewIndex === index && material.type === "image" && material.thumbnail && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
                    onClick={() => setPreviewIndex(null)}
                  >
                    <img
                      src={material.thumbnail}
                      alt={material.name}
                      className="max-w-[90vw] max-h-[90vh] object-contain"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* 拖拽位置指示器 */}
      {isDragActive && dragPosition && (
        <div
          className="absolute pointer-events-none w-8 h-8 rounded-full border-2 border-dashed border-blue-500 bg-blue-50/50"
          style={{
            left: dragPosition.x - 40,
            top: dragPosition.y - 40,
            transform: "translate(-50%, -50%)",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500 mx-auto mt-2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
      )}
    </div>
  );
}