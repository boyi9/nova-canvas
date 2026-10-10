// Nova启画 - Magic Canvas (Jaaz 草图 → 生成)
// 结合时间轴分段 + @reference + 镜头语言，支持草图输入

import { useState, useRef, useEffect, useCallback } from "react";
import { Button, Input, Select, Tooltip, Divider, Card, Alert, Typography, Space } from "antd";
import { Pencil, Eraser, Undo, Redo, Save, Image, X, Loader2, } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  TimeSegmentPrompt,
  VideoPromptStructure,
  VIDEO_PROMPT_TEMPLATES,
  VideoTemplateKey,
  CAMERA_MOVEMENTS,
  SHOT_TYPES,
  MOVEMENT_SPEEDS,
  buildEnhancedSeedancePrompt,
  createPromptFromTemplate,
  parseReferences,
  validateTimeSegments,
  getCameraMovement,
  getShotType,
  MOVEMENT_SPEEDS as MOVEMENT_SPEEDS_ENUM,
} from "@/lib/video-prompt-enhanced";

interface MagicCanvasProps {
  width: number;
  height: number;
  onGenerate: (prompt: string) => void;
  initialReferences?: { images: string[]; videos: string[]; audios: string[] };
}

const STROKE_WIDTH = 3;

export function MagicCanvas({ width, height, onGenerate, initialReferences }: MagicCanvasProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null)!;
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<{ color: string; points: Array<{ x: number; y: number }> }[]>([]);
  const [currentStroke, setCurrentStroke] = useState<{ color: string; points: Array<{ x: number; y: number }> } | null>(null);
  const [color, setColor] = useState("#000000");
  const [undoStack, setUndoStack] = useState<{ color: string; points: Array<{ x: number; y: number }> }[]>([]);
  const [redoStack, setRedoStack] = useState<{ color: string; points: Array<{ x: number; y: number }> }[]>([]);

  // Canvas ref setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      ctxRef.current = canvas.getContext("2d")!;
      ctxRef.current!.canvas.width = width;
      ctxRef.current!.canvas.height = height;
      ctxRef.current!.fillStyle = "white";
      ctxRef.current!.fillRect(0, 0, width, height);
      ctxRef.current!.strokeStyle = color;
      ctxRef.current!.lineWidth = STROKE_WIDTH;
      ctxRef.current!.lineCap = "round";
      ctxRef.current!.lineJoin = "round";
    }
  }, [width, height, color]);

  // Start drawing
  const startDraw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!ctxRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setDrawing(true);
    setCurrentStroke({
      color,
      points: [{ x: e.clientX - rect.left, y: e.clientY - rect.top }],
    });
    setStrokes((prev) => [...prev, { color, points: [{ x: e.clientX - rect.left, y: e.clientY - rect.top }] }]);
  }, [color]);

  // Draw movement
  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !ctxRef.current || !currentStroke) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const newPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    currentStroke.points.push(newPoint);
    
    // 绘制到 canvas
    ctxRef.current!.beginPath();
    ctxRef.current!.moveTo(
      currentStroke.points[currentStroke.points.length - 2]?.x || newPoint.x,
      currentStroke.points[currentStroke.points.length - 2]?.y || newPoint.y
    );
    ctxRef.current!.lineTo(newPoint.x, newPoint.y);
    ctxRef.current!.stroke();
    
    setStrokes((prev) => prev.map((stroke, i) =>
      i === strokes.length - 1 ? { color, points: [...stroke.points, newPoint] } : stroke
    ));
  }, [drawing, currentStroke]);

  // End drawing
  const endDraw = useCallback(() => {
    setDrawing(false);
    setCurrentStroke(null);
    // 保存到 undo 栈
    setUndoStack((prev) => [...prev, ...strokes]);
    setRedoStack([]);
  }, []);

  // Undo
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    setRedoStack((prev) => [...prev, ...strokes]);
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setStrokes([...undoStack]);
  }, [undoStack]);

  // Redo
  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    setUndoStack((prev) => [...prev, ...strokes]);
    setStrokes([...redoStack]);
    setRedoStack((prev) => prev.slice(0, -1));
  }, [redoStack]);

  // Clear canvas
  const clearCanvas = useCallback(() => {
    if (!ctxRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current!.fillStyle = "white";
    ctxRef.current!.fillRect(0, 0, canvas.width, canvas.height);
    setStrokes([]);
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  // Generate prompt from canvas
  const generateFromCanvas = useCallback(() => {
    if (!ctxRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // 导出 canvas 为 image data URL
    const dataUrl = canvas.toDataURL("image/png");
    
    // 创建基础结构化 prompt
    const structure: VideoPromptStructure = {
      globalPrompt: t('videoWorkbench.magicCanvasDefaultPrompt', { fallback: 'A professional video with artistic style' }),
      timeSegments: [
        { start: 0, end: 10, prompt: '', camera: 'static' },
        { start: 10, end: 20, prompt: '', camera: 'push_in' },
        { start: 20, end: 30, prompt: '', camera: 'pull_out' },
      ],
      references: {
        images: initialReferences?.images || [],
        videos: initialReferences?.videos || [],
        audios: initialReferences?.audios || [],
      },
      negativePrompt: '',
    };
    
    const fullPrompt = buildEnhancedSeedancePrompt(structure);
    onGenerate(fullPrompt);
  }, [t, initialReferences]);

  // 保存草图
  const saveSketch = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    if (dataUrl) {
      onGenerate(dataUrl);
    }
  }, [onGenerate]);

  return (
    <div className="space-y-4">
      {/* Canvas 绘制区域 */}
      <Card>
        <div className="flex items-center justify-between">
          <Typography.Text>{t('videoWorkbench.magicCanvas')}</Typography.Text>
          <div className="flex gap-2">
            <Button size="small" onClick={undo} disabled={undoStack.length === 0}>
              <Undo className="size-3.5" /> {t('videoEditor.undo')}
            </Button>
            <Button size="small" onClick={redo} disabled={redoStack.length === 0}>
              <Redo className="size-3.5" /> {t('videoEditor.redo')}
            </Button>
            <Button size="small" onClick={clearCanvas}>
              <X className="size-3.5" /> {t('videoEditor.clear')}
            </Button>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="border rounded w-full h-64 bg-white dark:bg-card"
          onMouseDown={(e) => startDraw(e)}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onMouseMove={(e) => draw(e)}
        />
        <Tooltip title={t('videoWorkbench.brushColor')}>
          <Select
            style={{ width: 100 }}
            onSelect={setColor}
            options={[
              { value: '#000000', label: 'Black' },
              { value: '#ffffff', label: 'White' },
              { value: '#ff0000', label: 'Red' },
              { value: '#00ff00', label: 'Green' },
              { value: '#0000ff', label: 'Blue' },
            ]}
          />
        </Tooltip>
      </Card>

      {/* 生成提示词 */}
      <Divider />
      <Card>
        <div className="p-3">
          <Typography.Text>{t('videoWorkbench.generatePrompt')}:</Typography.Text>
          <Input.TextArea
            rows={3}
            readOnly
            value={ctxRef.current ? ctxRef.current.canvas.toDataURL('image/png') : ''}
            placeholder={t('videoWorkbench.canvasPlaceholder')}
          />
          <Button type="primary" onClick={generateFromCanvas} disabled={!ctxRef.current}>
            {t('videoWorkbench.generate')}
          </Button>
          <Button size="small" onClick={saveSketch}>
            <Save className="size-3.5" /> {t('videoEditor.save')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default MagicCanvas;