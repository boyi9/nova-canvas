// Nova画 - 实时视频编辑器
// 集成 JoyAI-Video-Edit：WebSocket 流式编辑 + 自然语言指令 + 时间轴

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button, Input, Select, Slider, Tag, Tooltip, Divider, Card, Collapse, Alert, Tabs, Modal, Upload, message, Timeline, Popconfirm, Empty, Badge } from "antd";
import { Play, Pause, Square, Send, Zap, Image, Film, Download, Settings, Undo, Redo, Trash2, RotateCcw, Sparkles, Loader2, X, ChevronLeft, ChevronRight, Volume2, VolumeX, History, Camera, Save, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { JoyAIClient, createJoyAIClient, JoyAIConfig, JoyAIFrame, JOYAI_INSTRUCTION_TEMPLATES, type EditInstructionContext, type EditSnapshot } from "@/lib/joyai-video-edit";

interface VideoEditorProps {
  /** 源视频 URL 或 dataURL */
  sourceVideoUrl: string;
  /** 视频时长（秒） */
  duration?: number;
  /** 编辑完成回调 */
  onEditComplete?: (editedVideoBlob: Blob, frames: JoyAIFrame[]) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** JoyAI 服务器地址 */
  serverUrl?: string;
}

interface EditCommand {
  id: string;
  instruction: string;
  timestamp: number;
  startFrame: number;
  endFrame?: number;
  status: 'pending' | 'applied' | 'failed';
  context?: EditInstructionContext;
}

export function VideoEditor({
  sourceVideoUrl,
  duration = 30,
  onEditComplete,
  onError,
  serverUrl = "ws://localhost:8080",
}: VideoEditorProps) {
  const { t } = useTranslation();
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [commands, setCommands] = useState<EditCommand[]>([]);
  const [editedFrames, setEditedFrames] = useState<JoyAIFrame[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showTemplates, setShowTemplates] = useState(false);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<EditCommand[][]>([]);
  const [redoStack, setRedoStack] = useState<EditCommand[][]>([]);
  const [snapshots, setSnapshots] = useState<EditSnapshot[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [conversationContext, setConversationContext] = useState<string[]>([]);
  const [chainedMode, setChainedMode] = useState(true);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clientRef = useRef<ReturnType<typeof createJoyAIClient> | null>(null);
  const animationRef = useRef<number | null>(null);

  // 初始化客户端
  useEffect(() => {
    const client = createJoyAIClient({ serverUrl });
    clientRef.current = client;

    const unsubFrame = client.onFrame((frame) => {
      setEditedFrames(prev => [...prev, frame]);
      // 更新预览视频
      if (previewRef.current && previewRef.current.src !== frame.dataUrl) {
        previewRef.current.src = frame.dataUrl;
      }
    });

    const unsubStatus = client.onStatus((status) => {
      setConnected(status.connected);
      setStreaming(status.streaming);
    });

    const unsubError = client.onError((err) => {
      setError(err.message);
      onError?.(err);
    });

    // 连接
    client.connect().catch(err => {
      setError(t('videoEditor.connectionFailed', { error: err.message }));
      onError?.(err);
    });

    return () => {
      unsubFrame();
      unsubStatus();
      unsubError();
      client.disconnect();
    };
  }, [serverUrl, t, onError]);

  // 视频加载
  useEffect(() => {
    if (videoRef.current && sourceVideoUrl) {
      videoRef.current.src = sourceVideoUrl;
      videoRef.current.load();
    }
  }, [sourceVideoUrl]);

  // 发送编辑指令（支持链式多轮）
  const sendInstruction = useCallback(async (cmd: string) => {
    if (!clientRef.current || !connected) {
      setError(t('videoEditor.notConnected'));
      return;
    }
    
    // 保存当前状态到撤销栈
    setUndoStack(prev => [...prev, [...commands]]);
    setRedoStack([]);
    
    const newCommand: EditCommand = {
      id: Date.now().toString(),
      instruction: cmd,
      timestamp: Date.now(),
      startFrame: Math.floor(currentTime * 24),
      status: 'pending',
      context: {
        instruction: cmd,
        timestamp: Date.now(),
        promptHistory: conversationContext,
      },
    };
    
    setCommands(prev => [...prev, newCommand]);
    setConversationContext(prev => [...prev, cmd]);
    
    // 如果是链式模式，发送带上完整上下文
    if (chainedMode) {
      clientRef.current.setInstruction(cmd);
    } else {
      clientRef.current.setInstruction(cmd);
    }
    
    // 模拟应用延迟
    setTimeout(() => {
      setCommands(prev => prev.map(c => c.id === newCommand.id ? { ...c, status: 'applied' } : c));
    }, 500);
  }, [connected, currentTime, commands, conversationContext, chainedMode, t]);

  // 开始流式编辑
  const startStreaming = useCallback(async () => {
    if (!clientRef.current || !videoRef.current) return;
    
    try {
      await clientRef.current.startStreaming(videoRef.current);
    } catch (err) {
      setError(t('videoEditor.streamFailed', { error: (err as Error).message }));
    }
  }, [t]);

  // 停止流式编辑
  const stopStreaming = useCallback(() => {
    clientRef.current?.stopStreaming();
  }, []);

  // 导出视频
  const handleExport = useCallback(async () => {
    if (!clientRef.current || editedFrames.length === 0) {
      message.warning(t('videoEditor.noFrames'));
      return;
    }
    
    setExporting(true);
    try {
      const blob = await clientRef.current.exportVideo();
      onEditComplete?.(blob, editedFrames);
      
      // 下载
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited-video-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      
      message.success(t('videoEditor.exportSuccess'));
    } catch (err) {
      setError(t('videoEditor.exportFailed', { error: (err as Error).message }));
    } finally {
      setExporting(false);
    }
  }, [editedFrames, onEditComplete, t]);

  // 撤销
  const undoLast = useCallback(() => {
    if (undoStack.length === 0) return;
    
    const previousCommands = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, commands]);
    setCommands(previousCommands);
    
    // 更新对话上下文
    setConversationContext(previousCommands.map(c => c.instruction));
    message.success(t('videoEditor.undoSuccess'));
  }, [undoStack, commands, t]);

  // 重做
  const redoLast = useCallback(() => {
    if (redoStack.length === 0) return;
    
    const nextCommands = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, commands]);
    setCommands(nextCommands);
    
    setConversationContext(nextCommands.map(c => c.instruction));
    message.success(t('videoEditor.redoSuccess'));
  }, [redoStack, commands, t]);

  // 创建快照
  const createSnapshot = useCallback(() => {
    if (!clientRef.current) return;
    
    const snapshot = clientRef.current.createSnapshot(
      commands.length > 0 ? commands[commands.length - 1].instruction : 'Initial'
    );
    setSnapshots(prev => [...prev, snapshot]);
    message.success(t('videoEditor.snapshotCreated'));
  }, [commands, t]);

  // 恢复快照
  const restoreSnapshot = useCallback((snapshotId: string) => {
    if (!clientRef.current) return;
    
    const success = clientRef.current.restoreSnapshot(snapshotId);
    if (success) {
      setCommands([]);
      setConversationContext([]);
      message.success(t('videoEditor.snapshotRestored'));
    } else {
      message.error(t('videoEditor.snapshotRestoreFailed'));
    }
  }, [t]);

  // 清空所有
  const clearAll = useCallback(() => {
    setCommands([]);
    setEditedFrames([]);
    setConversationContext([]);
    setUndoStack([]);
    setRedoStack([]);
    clientRef.current?.setInstruction('');
    clientRef.current?.clearInstructionHistory();
    if (previewRef.current) previewRef.current.src = '';
  }, []);

  // 插入模板指令
  const insertTemplate = useCallback((template: string) => {
    setInstruction(prev => prev + (prev ? ' ' : '') + template);
  }, []);

  // 视频播放控制
  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (playing) videoRef.current.pause();
      else videoRef.current.play();
      setPlaying(!playing);
    }
  }, [playing]);

  const seek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  // 更新当前时间
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, []);

  // 指令模板分类
  const templateCategories = useMemo(() => Object.entries(JOYAI_INSTRUCTION_TEMPLATES), []);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* 连接状态 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`flex size-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm">
            {connected 
              ? (streaming ? t('videoEditor.streaming') : t('videoEditor.connected'))
              : t('videoEditor.disconnected')
            }
          </span>
          {streaming && <span className="text-xs text-blue-500 animate-pulse">{t('videoEditor.live')}</span>}
        </div>
        <div className="flex gap-2">
          <Button size="small" onClick={clearAll} disabled={commands.length === 0 && editedFrames.length === 0}>
            <RotateCcw className="size-3.5" /> {t('videoEditor.clear')}
          </Button>
          <Button size="small" onClick={undoLast} disabled={undoStack.length === 0}>
            <Undo className="size-3.5" /> {t('videoEditor.undo')}
          </Button>
          <Button size="small" onClick={redoLast} disabled={redoStack.length === 0}>
            <Redo className="size-3.5" /> {t('videoEditor.redo')}
          </Button>
          <Button size="small" onClick={createSnapshot} disabled={!connected}>
            <Save className="size-3.5" /> {t('videoEditor.snapshot')}
          </Button>
          <Button size="small" onClick={() => setHistoryVisible(true)}>
            <History className="size-3.5" /> {t('videoEditor.history')}
          </Button>
        </div>
      </div>

      <Divider />

      {/* 双视频预览：原始 vs 编辑后 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* 原始视频 */}
        <Card className="h-full flex flex-col">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium">{t('videoEditor.originalVideo')}</span>
            <Tag color="gray">{t('videoEditor.source')}</Tag>
          </div>
          <div className="relative aspect-video bg-muted dark:bg-card rounded overflow-hidden flex-1">
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            {!sourceVideoUrl && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                {t('videoEditor.noSourceVideo')}
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button size="small" icon={playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} onClick={togglePlay} />
            <Button size="small" icon={<Square className="size-3.5" />} onClick={() => videoRef.current?.pause()} />
            <div className="flex-1">
              <Slider
                value={currentTime}
                max={duration}
                step={0.1}
                onChange={seek}
                marks={{ 0: '0s', [duration]: `${duration}s` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-20 text-right">
              {currentTime.toFixed(1)}s / {duration}s
            </span>
            <Button size="small" icon={volume > 0 ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />} onClick={() => {
              if (videoRef.current) {
                videoRef.current.muted = !videoRef.current.muted;
                setVolume(videoRef.current.muted ? 0 : 1);
              }
            }} />
          </div>
        </Card>

        {/* 编辑后预览 */}
        <Card className="h-full flex flex-col">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium">{t('videoEditor.editedPreview')}</span>
            <Tag color={streaming ? 'green' : 'blue'}>
              {streaming ? t('videoEditor.live') : t('videoEditor.result')}
            </Tag>
          </div>
          <div className="relative aspect-video bg-muted dark:bg-card rounded overflow-hidden flex-1">
            {editedFrames.length > 0 ? (
              <video
                ref={previewRef}
                className="w-full h-full object-contain"
                autoPlay
                loop
                muted
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                {streaming ? t('videoEditor.waitingFrames') : t('videoEditor.noEditedFrames')}
              </div>
            )}
            {streaming && (
              <div className="absolute top-2 right-2 flex gap-1">
                <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded animate-pulse flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-white animate-pulse" />
                  {t('videoEditor.recording')}
                </span>
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('videoEditor.framesGenerated', { count: editedFrames.length })}</span>
            <Button size="small" icon={<Download className="size-3.5" />} onClick={handleExport} loading={exporting} disabled={editedFrames.length === 0 || exporting}>
              {t('videoEditor.exportVideo')}
            </Button>
          </div>
        </Card>
      </div>

      {/* 自然语言指令输入 */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-medium">{t('videoEditor.editInstruction')}</span>
          <div className="flex items-center gap-2">
            <Tooltip title={chainedMode ? t('videoEditor.chainedModeOn') : t('videoEditor.chainedModeOff')}>
              <Button
                type="text"
                size="small"
                onClick={() => setChainedMode(!chainedMode)}
                icon={chainedMode ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              />
            </Tooltip>
            <Button type="text" size="small" onClick={() => setShowTemplates(!showTemplates)}>
              <Sparkles className="size-3.5 mr-1" /> {showTemplates ? t('videoEditor.hideTemplates') : t('videoEditor.showTemplates')}
            </Button>
          </div>
        </div>
        
        <div className="flex gap-2 mb-3">
          <Input.TextArea
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder={chainedMode ? t('videoEditor.instructionPlaceholderChained') : t('videoEditor.instructionPlaceholder')}
            rows={2}
            style={{ flex: 1 }}
            showCount
          />
          <Button type="primary" icon={<Send className="size-3.5" />} onClick={() => { sendInstruction(instruction); setInstruction(''); }} disabled={!instruction.trim() || !connected}>
            {t('videoEditor.apply')}
          </Button>
        </div>

        {/* 对话上下文显示 */}
        {conversationContext.length > 0 && (
          <div className="mb-3 p-2 bg-background dark:bg-card rounded">
            <div className="text-xs text-muted-foreground mb-1">{t('videoEditor.conversationContext')}</div>
            <div className="flex flex-wrap gap-1">
              {conversationContext.slice(-5).map((ctx, idx) => (
                <Tag key={idx} className="text-xs">{ctx}</Tag>
              ))}
              {conversationContext.length > 5 && <Tag>+{conversationContext.length - 5}</Tag>}
            </div>
          </div>
        )}

        {/* 模板快捷按钮 */}
        {showTemplates && (
          <div className="space-y-3">
            {templateCategories.map(([category, templates]) => (
              <div key={category}>
                <div className="mb-1 text-xs font-medium text-muted-foreground uppercase">{category}</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(templates).map(([key, template]) => (
                    <Button
                      key={key}
                      type="text"
                      size="small"
                      onClick={() => insertTemplate(template.replace(/\{(\w+)\}/g, ''))}
                      className="h-6 px-2 text-xs"
                    >
                      {key}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 参考图片上传 (RV2V) */}
        <Divider dashed>{t('videoEditor.referenceImage')}</Divider>
        <div className="mt-3">
          <Upload
            accept="image/*"
            showUploadList={false}
            onChange={({ file }) => {
              if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                  const dataUrl = e.target?.result as string;
                  setReferenceImage(dataUrl);
                  clientRef.current?.setReferenceImage(dataUrl);
                  message.success(t('videoEditor.referenceSet'));
                };
                reader.readAsDataURL(file.originFileObj as File);
              }
            }}
          >
            <Button icon={referenceImage ? <Image className="size-3.5" /> : <Image className="size-3.5" />} type={referenceImage ? 'primary' : 'default'}>
              {referenceImage ? t('videoEditor.changeReference') : t('videoEditor.uploadReference')}
            </Button>
          </Upload>
          {referenceImage && (
            <div className="mt-2 flex items-center gap-2">
              <img src={referenceImage} alt="Reference" className="size-16 rounded border" />
              <Button type="text" size="small" danger onClick={() => { setReferenceImage(null); clientRef.current?.setReferenceImage(''); }}>
                <X className="size-3.5" /> {t('videoEditor.removeReference')}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* 指令历史 */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-medium">{t('videoEditor.commandHistory')} ({commands.length})</span>
        </div>
        {commands.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{t('videoEditor.noCommands')}</div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {commands.map((cmd) => (
              <div
                key={cmd.id}
                className="flex items-center gap-2 p-2 rounded bg-background dark:bg-card border border-border dark:border-border"
              >
                <span className={`size-2 rounded-full ${cmd.status === 'applied' ? 'bg-green-500' : cmd.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
                <span className="flex-1 text-sm truncate">{cmd.instruction}</span>
                <Tag color={cmd.status === 'applied' ? 'green' : cmd.status === 'failed' ? 'red' : 'yellow'}>
                  {t(`videoEditor.status${cmd.status.charAt(0).toUpperCase() + cmd.status.slice(1)}`)}
                </Tag>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 错误提示 */}
      {error && (
        <Alert type="error" showIcon message={t('videoEditor.error')} description={error} onClose={() => setError(null)} closable />
      )}

      {/* 历史浏览器 Modal */}
      <Modal
        title={t('videoEditor.historyBrowser')}
        open={historyVisible}
        onCancel={() => setHistoryVisible(false)}
        footer={null}
        width={600}
      >
        <div className="space-y-4">
          {/* 快照列表 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{t('videoEditor.snapshots')}</span>
              <Button size="small" onClick={createSnapshot} disabled={!connected}>
                <Save className="size-3.5 mr-1" /> {t('videoEditor.createSnapshot')}
              </Button>
            </div>
            {snapshots.length === 0 ? (
              <Empty description={t('videoEditor.noSnapshots')} />
            ) : (
              <div className="space-y-2">
                {snapshots.map((snapshot) => (
                  <div key={snapshot.id} className="flex items-center justify-between p-2 bg-background dark:bg-card rounded">
                    <div>
                      <div className="text-sm font-medium">{snapshot.instruction}</div>
                      <div className="text-xs text-muted-foreground">{new Date(snapshot.timestamp).toLocaleString()}</div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="small" onClick={() => restoreSnapshot(snapshot.id)}>
                        {t('videoEditor.restore')}
                      </Button>
                      <Popconfirm title={t('videoEditor.confirmDelete')} onConfirm={() => {
                        setSnapshots(prev => prev.filter(s => s.id !== snapshot.id));
                        clientRef.current?.deleteSnapshot(snapshot.id);
                      }}>
                        <Button size="small" danger>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </Popconfirm>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 指令历史时间线 */}
          <div>
            <div className="font-medium mb-2">{t('videoEditor.instructionTimeline')}</div>
            <Timeline
              items={commands.map((cmd) => ({
                children: (
                  <div>
                    <div className="text-sm">{cmd.instruction}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(cmd.timestamp).toLocaleTimeString()} • 
                      <Tag color={cmd.status === 'applied' ? 'green' : cmd.status === 'failed' ? 'red' : 'yellow'} className="ml-1">
                        {cmd.status}
                      </Tag>
                    </div>
                  </div>
                ),
                color: cmd.status === 'applied' ? 'green' : cmd.status === 'failed' ? 'red' : 'yellow',
              }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default VideoEditor;