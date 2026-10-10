// Nova启画 - 视频时间轴分段提示词编辑器
// 集成 seedance2-skill：时间轴分段 + @reference + 镜头语言

import { useState, useMemo } from "react";
import { Button, Input, InputNumber, Select, Form, Tag, Tooltip, Divider, Collapse, Alert, Space, Slider, Switch } from "antd";
import { Plus, Minus, GripVertical, Camera, Clock, Target, Zap, Film, Image, Mic, Settings, HelpCircle, Copy, Download } from "lucide-react";
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
} from "@/lib/video-prompt-enhanced";

interface TimeSegmentPromptEditorProps {
  duration: number;
  references: {
    images: { id: string; name: string }[];
    videos: { id: string; name: string }[];
    audios: { id: string; name: string }[];
  };
  onChange: (structure: VideoPromptStructure) => void;
  initialStructure?: VideoPromptStructure;
}

const DEFAULT_SEGMENTS: TimeSegmentPrompt[] = [
  { start: 0, end: 3, prompt: '', camera: 'static' },
  { start: 3, end: 6, prompt: '', camera: 'orbit_left' },
  { start: 6, end: 9, prompt: '', camera: 'push_in' },
  { start: 9, end: 12, prompt: '', camera: 'pull_out' },
  { start: 12, end: 15, prompt: '', camera: 'static' },
];

const CAMERA_OPTIONS = Object.entries(CAMERA_MOVEMENTS).flatMap(([key, movements]) =>
  movements.map(m => ({ label: `${key}: ${m}`, value: m }))
);

const SHOT_OPTIONS = Object.entries(SHOT_TYPES).flatMap(([key, shots]) =>
  shots.map(s => ({ label: `${key}: ${s}`, value: s }))
);

const SPEED_OPTIONS = Object.entries(MOVEMENT_SPEEDS).map(([key, desc]) => ({ label: `${key}: ${desc}`, value: key }));

export function TimeSegmentPromptEditor({
  duration,
  references,
  onChange,
  initialStructure,
}: TimeSegmentPromptEditorProps) {
  const { t } = useTranslation();
  const [segments, setSegments] = useState<TimeSegmentPrompt[]>(
    initialStructure?.timeSegments?.length ? initialStructure.timeSegments : DEFAULT_SEGMENTS.map((s, i) => ({
      ...s,
      end: Math.min(s.end, duration),
    }))
  );
  const [globalPrompt, setGlobalPrompt] = useState(initialStructure?.globalPrompt || '');
  const [negativePrompt, setNegativePrompt] = useState(initialStructure?.negativePrompt || '');
  const [activeTemplate, setActiveTemplate] = useState<VideoTemplateKey | ''>('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 可用的@reference引用
  const availableRefs = useMemo(() => [
    ...references.images.map((img, i) => ({ type: 'image' as const, label: `@image_${i + 1}: ${img.name}`, value: `@image_${i + 1}` })),
    ...references.videos.map((vid, i) => ({ type: 'video' as const, label: `@video_${i + 1}: ${vid.name}`, value: `@video_${i + 1}` })),
    ...references.audios.map((aud, i) => ({ type: 'audio' as const, label: `@audio_${i + 1}: ${aud.name}`, value: `@audio_${i + 1}` })),
  ], [references]);

  // 验证（派生值：在 useMemo 中直接计算，避免渲染期 setState）
  const validationErrors = useMemo(() => {
    const { errors } = validateTimeSegments(segments, duration);
    return errors;
  }, [segments, duration]);

  // 触发onChange
  const emitChange = () => {
    const structure: VideoPromptStructure = {
      globalPrompt,
      timeSegments: segments,
      references: {
        images: references.images.map(r => r.id),
        videos: references.videos.map(r => r.id),
        audios: references.audios.map(r => r.id),
      },
      negativePrompt,
    };
    onChange(structure);
  };

  const updateSegment = (index: number, updates: Partial<TimeSegmentPrompt>) => {
    setSegments(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s));
    emitChange();
  };

  const addSegment = () => {
    const last = segments[segments.length - 1];
    const newStart = last.end;
    const newEnd = Math.min(newStart + 3, duration);
    if (newStart >= duration) return;
    
    setSegments(prev => [...prev, {
      start: newStart,
      end: newEnd,
      prompt: '',
      camera: 'static',
    }]);
    emitChange();
  };

  const removeSegment = (index: number) => {
    if (segments.length <= 1) return;
    setSegments(prev => prev.filter((_, i) => i !== index));
    emitChange();
  };

  const applyTemplate = (templateKey: VideoTemplateKey) => {
    const template = VIDEO_PROMPT_TEMPLATES[templateKey];
    const vars: Record<string, string> = {};
    // 可以根据需要填充变量
    
    const structure = createPromptFromTemplate(templateKey, vars, {
      images: references.images.map(r => r.id),
      videos: references.videos.map(r => r.id),
      audios: references.audios.map(r => r.id),
    });
    
    // 调整时间段以匹配总时长
    const adjustedSegments = structure.timeSegments.map((seg, i, arr) => {
      const proportion = (seg.end - seg.start) / (arr[arr.length - 1].end);
      const newStart = Math.round(i / arr.length * duration);
      const newEnd = i === arr.length - 1 ? duration : Math.round((i + 1) / arr.length * duration);
      return { ...seg, start: newStart, end: newEnd };
    });
    
    setSegments(adjustedSegments);
    setGlobalPrompt(structure.globalPrompt);
    setActiveTemplate(templateKey);
    emitChange();
  };

  const insertReference = (refValue: string, targetSegmentIndex?: number) => {
    if (targetSegmentIndex !== undefined) {
      setSegments(prev => prev.map((s, i) => 
        i === targetSegmentIndex 
          ? { ...s, prompt: s.prompt + (s.prompt ? ' ' : '') + refValue }
          : s
      ));
    } else {
      setGlobalPrompt(prev => prev + (prev ? ' ' : '') + refValue);
    }
    emitChange();
  };

  const copyFullPrompt = () => {
    const structure: VideoPromptStructure = {
      globalPrompt,
      timeSegments: segments,
      references: {
        images: references.images.map(r => r.id),
        videos: references.videos.map(r => r.id),
        audios: references.audios.map(r => r.id),
      },
      negativePrompt,
    };
    const fullPrompt = buildEnhancedSeedancePrompt(structure);
    navigator.clipboard.writeText(fullPrompt);
  };

  const downloadPrompt = () => {
    const structure: VideoPromptStructure = {
      globalPrompt,
      timeSegments: segments,
      references: {
        images: references.images.map(r => r.id),
        videos: references.videos.map(r => r.id),
        audios: references.audios.map(r => r.id),
      },
      negativePrompt,
    };
    const fullPrompt = buildEnhancedSeedancePrompt(structure);
    const blob = new Blob([fullPrompt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `video-prompt-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* 模板快速应用 */}
      <div className="rounded-lg border border-border bg-background p-3 dark:border-border dark:bg-card">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">{t('videoWorkbench.promptTemplates')}</span>
          <Button type="text" size="small" icon={<Download className="size-3.5" />} onClick={downloadPrompt}>
            {t('videoWorkbench.exportPrompt')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(VIDEO_PROMPT_TEMPLATES).map(([key, template]) => (
            <Button
              key={key}
              type={activeTemplate === key ? 'primary' : 'default'}
              size="small"
              onClick={() => applyTemplate(key as VideoTemplateKey)}
            >
              {template.name}
            </Button>
          ))}
        </div>
      </div>

      {/* 全局基础提示词 */}
      <Form.Item label={t('videoWorkbench.globalPrompt')} name="globalPrompt">
        <Input.TextArea
          value={globalPrompt}
          onChange={e => { setGlobalPrompt(e.target.value); emitChange(); }}
          rows={2}
          placeholder={t('videoWorkbench.globalPromptPlaceholder')}
          showCount
        />
        <Form.Item name="globalPromptHelp" noStyle>
          <span className="text-xs text-muted-foreground">{t('videoWorkbench.globalPromptHelp')}</span>
        </Form.Item>
      </Form.Item>

      {/* 负面提示词 */}
      <Form.Item label={t('videoWorkbench.negativePrompt')} name="negativePrompt">
        <Input.TextArea
          value={negativePrompt}
          onChange={e => { setNegativePrompt(e.target.value); emitChange(); }}
          rows={1}
          placeholder={t('videoWorkbench.negativePromptPlaceholder')}
          showCount
        />
      </Form.Item>

      {/* 时间轴分段 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t('videoWorkbench.timeSegments')} ({segments.length})</span>
          <Button size="small" icon={<Plus className="size-3.5" />} onClick={addSegment} disabled={segments[segments.length - 1]?.end >= duration}>
            {t('videoWorkbench.addSegment')}
          </Button>
        </div>

        {validationErrors.length > 0 && (
          <Alert type="error" showIcon message={t('videoWorkbench.validationError')} description={validationErrors.join(', ')} />
        )}

        <div className="space-y-2">
          {segments.map((segment, index) => (
            <div
              key={index}
              className="rounded-lg border border-border bg-background p-3 dark:border-border group relative"
            >
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center justify-center text-xs text-muted-foreground w-10 shrink-0">
                  <GripVertical className="size-4 cursor-grab opacity-50 group-hover:opacity-100" />
                  <span>{index + 1}</span>
                </div>
                
                <div className="flex-1 min-w-0 space-y-2">
                  {/* 时间范围 */}
                  <div className="flex items-center gap-2">
                    <Tooltip title={t('videoWorkbench.startTime')}>
                      <InputNumber
                        style={{ width: 80 }}
                        min={0}
                        max={Math.max(0, segment.end - 1)}
                        value={segment.start}
                        onChange={v => updateSegment(index, { start: v ?? undefined })}
                        addonAfter="s"
                        precision={0}
                      />
                    </Tooltip>
                    <span className="text-muted-foreground">→</span>
                    <Tooltip title={t('videoWorkbench.endTime')}>
                      <InputNumber
                        style={{ width: 80 }}
                        min={segment.start + 1}
                        max={duration}
                        value={segment.end}
                        onChange={v => updateSegment(index, { end: v ?? undefined })}
                        addonAfter="s"
                        precision={0}
                      />
                    </Tooltip>
                    <span className="text-xs text-muted-foreground ml-auto">({segment.end - segment.start}s)</span>
                    <Button type="text" size="small" danger icon={<Minus className="size-3.5" />} onClick={() => removeSegment(index)} className="ml-2 opacity-0 group-hover:opacity-100" />
                  </div>

                  {/* 提示词输入 + @reference快捷插入 */}
                  <div className="relative">
                    <Input.TextArea
                      value={segment.prompt}
                      onChange={e => updateSegment(index, { prompt: e.target.value })}
                      rows={2}
                      placeholder={t('videoWorkbench.segmentPromptPlaceholder')}
                      showCount
                    />
                    {availableRefs.length > 0 && (
                      <div className="absolute right-2 top-2 flex gap-1">
                        {availableRefs.map(ref => (
                          <Button
                            key={ref.value}
                            type="text"
                            size="small"
                            onClick={() => insertReference(ref.value, index)}
                            className="h-6 px-1.5 text-xs"
                          >
                            {ref.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 镜头控制 */}
                  <div className="flex flex-wrap gap-2">
                    <Select
                      style={{ width: 180 }}
                      value={segment.camera || ''}
                      placeholder={t('videoWorkbench.cameraMovement')}
                      onChange={v => updateSegment(index, { camera: v })}
                      allowClear
                      options={CAMERA_OPTIONS}
                      showSearch
                      filterOption={(input, option) => option?.label?.toLowerCase().includes(input.toLowerCase()) ?? false}
                    />
                    <Select
                      style={{ width: 160 }}
                      value={segment.shot || ''}
                      placeholder={t('videoWorkbench.shotType')}
                      onChange={v => updateSegment(index, { shot: v })}
                      allowClear
                      options={SHOT_OPTIONS}
                      showSearch
                    />
                    <Select
                      style={{ width: 140 }}
                      value={segment.speed || ''}
                      placeholder={t('videoWorkbench.movementSpeed')}
                      onChange={v => updateSegment(index, { speed: v })}
                      allowClear
                      options={SPEED_OPTIONS}
                    />
                  </div>

                  {/* @reference 引用显示 */}
                  {segment.reference && (
                    <Tag color="blue" className="ml-auto">
                      <Target className="size-3 inline mr-1" />
                      {segment.reference}
                    </Tag>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 高级选项 */}
      <Collapse defaultActiveKey={showAdvanced ? ['advanced'] : []} onChange={keys => setShowAdvanced(keys.length > 0)}>
        <Collapse.Panel header={<span className="flex items-center gap-2"><Settings className="size-4" />{t('videoWorkbench.advancedOptions')}</span>} key="advanced">
          <div className="space-y-3 pt-2">
            <Form.Item label={t('videoWorkbench.negativePrompt')} name="negativePromptAdv">
              <Input.TextArea value={negativePrompt} onChange={e => { setNegativePrompt(e.target.value); emitChange(); }} rows={1} placeholder={t('videoWorkbench.negativePromptPlaceholder')} />
            </Form.Item>

            <div className="grid grid-cols-2 gap-3">
              <Form.Item label={t('videoWorkbench.resolution')} name="resolution">
                <Select placeholder="720p" style={{ width: '100%' }} options={[
                  { value: '480p', label: '480p' },
                  { value: '720p', label: '720p' },
                  { value: '1080p', label: '1080p' },
                ]} />
              </Form.Item>
              <Form.Item label={t('videoWorkbench.ratio')} name="ratio">
                <Select placeholder="16:9" style={{ width: '100%' }} options={[
                  { value: '16:9', label: '16:9' },
                  { value: '9:16', label: '9:16' },
                  { value: '1:1', label: '1:1' },
                  { value: '4:3', label: '4:3' },
                  { value: '21:9', label: '21:9' },
                ]} />
              </Form.Item>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Form.Item label={t('videoWorkbench.duration')} name="durationAdv">
                <Slider min={4} max={15} step={1} marks={{ 4: '4s', 8: '8s', 15: '15s' }} />
              </Form.Item>
              <Form.Item label={t('videoWorkbench.fps')} name="fps">
                <Select placeholder="24" style={{ width: '100%' }} options={[
                  { value: 24, label: '24fps' },
                  { value: 30, label: '30fps' },
                  { value: 60, label: '60fps' },
                ]} />
              </Form.Item>
            </div>
          </div>
        </Collapse.Panel>
      </Collapse>

      {/* 预览生成的完整Prompt */}
      <Collapse defaultActiveKey={[]}>
        <Collapse.Panel header={<span className="flex items-center gap-2"><HelpCircle className="size-4" />{t('videoWorkbench.promptPreview')}</span>} key="preview">
          <div className="pt-2 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{t('videoWorkbench.generatedPrompt')}</span>
              <div className="flex gap-2">
                <Button size="small" icon={<Copy className="size-3.5" />} onClick={copyFullPrompt}>
                  {t('common.copy')}
                </Button>
                <Button size="small" icon={<Download className="size-3.5" />} onClick={downloadPrompt}>
                  {t('common.download')}
                </Button>
              </div>
            </div>
            <pre className="bg-muted dark:bg-card rounded p-3 text-xs overflow-x-auto max-h-60 whitespace-pre-wrap font-mono text-foreground dark:text-muted-foreground">
              {(() => {
                const structure: VideoPromptStructure = {
                  globalPrompt,
                  timeSegments: segments,
                  references: {
                    images: references.images.map(r => r.id),
                    videos: references.videos.map(r => r.id),
                    audios: references.audios.map(r => r.id),
                  },
                  negativePrompt,
                };
                return buildEnhancedSeedancePrompt(structure);
              })()}
            </pre>
          </div>
        </Collapse.Panel>
      </Collapse>
    </div>
  );
}

export default TimeSegmentPromptEditor;