// Nova启画 - Seedance 2.0 视频提示词增强语法
// 参考：seedance2-skill 时间轴分段 + @reference + 镜头语言词汇表

export interface TimeSegmentPrompt {
  start: number;      // 开始秒数
  end: number;        // 结束秒数
  prompt: string;     // 该时间段的提示词
  camera?: string;    // 镜头运动
  reference?: string; // @reference引用
  shot?: string;      // 镜头类型
  speed?: string;     // 运镜速度
}

export interface VideoPromptStructure {
  globalPrompt: string;           // 全局基础提示词
  timeSegments: TimeSegmentPrompt[]; // 时间轴分段
  references: {
    images: string[];             // @image_1, @image_2...
    videos: string[];             // @video_1, @video_2...
    audios: string[];             // @audio_1, @audio_2...
  };
  negativePrompt?: string;
  // 技术参数
  resolution?: string;
  ratio?: string;
  duration?: number;
  fps?: number;
  seed?: number;
}

// === 镜头运动词汇表 ===
export const CAMERA_MOVEMENTS: Record<string, string[]> = {
  static: ['static shot', 'locked off', 'tripod', 'steady cam'],
  push_in: ['push in', 'dolly in', 'slow push', 'dramatic push in'],
  pull_out: ['pull out', 'dolly out', 'slow pull', 'reveal shot'],
  pan_left: ['pan left', 'horizontal pan left'],
  pan_right: ['pan right', 'horizontal pan right'],
  tilt_up: ['tilt up', 'vertical tilt up'],
  tilt_down: ['tilt down', 'vertical tilt down'],
  orbit_left: ['orbit left', 'arc left', 'circle around left'],
  orbit_right: ['orbit right', 'arc right', 'circle around right'],
  truck_left: ['truck left', 'crab left', 'lateral move left'],
  truck_right: ['truck right', 'crab right', 'lateral move right'],
  pedestal_up: ['pedestal up', 'boom up', 'jib up'],
  pedestal_down: ['pedestal down', 'boom down', 'jib down'],
  handheld: ['handheld', 'shaky cam', 'documentary style', 'organic movement'],
  follow: ['follow shot', 'tracking shot', 'follow behind', 'follow beside'],
  drone_up: ['drone shot', 'aerial rise', 'crane up', 'god view rising'],
  drone_down: ['drone descend', 'aerial drop', 'crane down', 'top down reveal'],
  zoom: ['zoom in', 'zoom out', 'crash zoom', 'smooth zoom'],
  focus_pull: ['rack focus', 'focus pull', 'depth transition'],
  whip_pan: ['whip pan', 'swish pan', 'fast blur transition'],
  rotation: ['dutch angle', 'rotation', 'barrel roll'],
};

export type CameraMovementKey = keyof typeof CAMERA_MOVEMENTS;

// === 镜头类型词汇 ===
export const SHOT_TYPES: Record<string, string[]> = {
  extreme_wide: ['extreme wide shot', 'EWS', 'establishing shot'],
  wide: ['wide shot', 'WS', 'full shot', 'master shot'],
  full: ['full shot', 'figure shot', 'head to toe'],
  medium: ['medium shot', 'MS', 'waist up'],
  close_up: ['close up', 'CU', 'face shot', 'detail shot'],
  extreme_close_up: ['extreme close up', 'ECU', 'macro', 'micro detail'],
  over_shoulder: ['over shoulder', 'OTS', 'perspective shot'],
  pov: ['POV', 'point of view', 'first person'],
  two_shot: ['two shot', 'dual shot', 'both characters'],
  group: ['group shot', 'ensemble', 'crowd shot'],
};

export type ShotTypeKey = keyof typeof SHOT_TYPES;

// === 运镜速度 ===
export const MOVEMENT_SPEEDS: Record<string, string> = {
  static: 'static',
  very_slow: 'very slow, glacial pace',
  slow: 'slow, deliberate, languid',
  moderate: 'moderate, steady pace',
  fast: 'fast, dynamic, energetic',
  very_fast: 'very fast, rapid, whiplash',
  variable: 'variable speed, speed ramping',
};

// === 视频专用提示词模板 ===
export const VIDEO_PROMPT_TEMPLATES: Record<string, { name: string; structure: TimeSegmentPrompt[] }> = {
  // 电商产品展示类
  'product-showcase': {
    name: '产品360展示',
    structure: [
      { start: 0, end: 3, prompt: 'product hero shot, {product_name} centered, clean background', camera: 'static' },
      { start: 3, end: 6, prompt: 'slow 360 degree rotation around {product_name}', camera: 'orbit_left' },
      { start: 6, end: 9, prompt: 'close up details of {product_name} key features', camera: 'push_in', shot: 'close_up' },
      { start: 9, end: 12, prompt: '{product_name} in use scenario, lifestyle context', camera: 'pull_out', shot: 'medium' },
      { start: 12, end: 15, prompt: 'final hero shot with branding, call to action', camera: 'static' },
    ],
  },
  'product-demo': {
    name: '产品功能演示',
    structure: [
      { start: 0, end: 3, prompt: 'problem scenario, pain point visualization', camera: 'wide' },
      { start: 3, end: 6, prompt: '{product_name} introduced as solution, reveal', camera: 'pull_out' },
      { start: 6, end: 10, prompt: 'step-by-step demonstration of {product_name} features', camera: 'handheld' },
      { start: 10, end: 13, prompt: 'before/after comparison split screen', camera: 'static' },
      { start: 13, end: 15, prompt: 'call to action, purchase info', camera: 'static' },
    ],
  },
  // 短剧/故事类
  'drama-opening': {
    name: '短剧开场',
    structure: [
      { start: 0, end: 3, prompt: 'establishing shot, {location}, {time_of_day}, mood setting', camera: 'drone_up', shot: 'extreme_wide' },
      { start: 3, end: 6, prompt: 'character introduction, {protagonist} enters frame', camera: 'push_in', shot: 'full' },
      { start: 6, end: 10, prompt: 'inciting incident, tension building', camera: 'handheld', shot: 'medium' },
      { start: 10, end: 15, prompt: 'cliffhanger moment, title card', camera: 'whip_pan' },
    ],
  },
  'drama-dialogue': {
    name: '对话场景',
    structure: [
      { start: 0, end: 4, prompt: '{character_a} and {character_b} conversation, {location}', camera: 'two_shot' },
      { start: 4, end: 8, prompt: 'alternating close ups, reaction shots', camera: 'focus_pull', shot: 'close_up' },
      { start: 8, end: 12, prompt: 'emotional beat, character internal moment', camera: 'slow_push', shot: 'extreme_close_up' },
      { start: 12, end: 15, prompt: 'scene resolution, wider context', camera: 'pull_out', shot: 'medium' },
    ],
  },
  // 品牌广告类
  'brand-emotional': {
    name: '品牌情感片',
    structure: [
      { start: 0, end: 3, prompt: 'atmospheric opening, {brand_mood} tone, poetic visual', camera: 'slow', shot: 'wide' },
      { start: 3, end: 7, prompt: 'human story, {protagonist} journey, emotional connection', camera: 'follow', shot: 'medium' },
      { start: 7, end: 11, prompt: 'product as enabler, subtle integration', camera: 'push_in', shot: 'close_up' },
      { start: 11, end: 15, prompt: 'brand logo, tagline, emotional resonance', camera: 'static' },
    ],
  },
  'brand-kinetic': {
    name: '品牌动感片',
    structure: [
      { start: 0, end: 2, prompt: 'fast cut montage, energy burst', camera: 'very_fast', shot: 'extreme_wide' },
      { start: 2, end: 6, prompt: 'rhythmic product-action sync, beat-driven', camera: 'handheld', shot: 'medium' },
      { start: 6, end: 10, prompt: 'climax moment, maximum visual impact', camera: 'orbit_right', shot: 'close_up' },
      { start: 10, end: 15, prompt: 'brand lockup, tagline, drive to action', camera: 'static' },
    ],
  },
  // 社媒短视频
  'social-hook': {
    name: '3秒钩子开场',
    structure: [
      { start: 0, end: 3, prompt: 'VISUAL HOOK: {shocking_visual} or {provocative_question}, immediate grab', camera: 'crash_zoom' },
      { start: 3, end: 8, prompt: 'value delivery, {core_message}, proof/demo', camera: 'moderate' },
      { start: 8, end: 13, prompt: 'social proof, testimonials, results', camera: 'static' },
      { start: 13, end: 15, prompt: 'CTA: follow/link/bio, urgent but friendly', camera: 'static' },
    ],
  },
  'social-tutorial': {
    name: '教程/技巧分享',
    structure: [
      { start: 0, end: 3, prompt: 'problem statement, {common_mistake} visualization', camera: 'static' },
      { start: 3, end: 9, prompt: 'step-by-step tutorial, {product_name} as tool, clear actions', camera: 'handheld', shot: 'close_up' },
      { start: 9, end: 12, prompt: 'pro tip / secret technique reveal', camera: 'push_in', shot: 'extreme_close_up' },
      { start: 12, end: 15, prompt: 'result showcase, save/share prompt', camera: 'static' },
    ],
  },
};

export type VideoTemplateKey = keyof typeof VIDEO_PROMPT_TEMPLATES;

// === @Reference 语法解析器 ===
export interface ParsedReference {
  type: 'image' | 'video' | 'audio';
  index: number;        // 1-based
  originalText: string; // @image_1
}

/**
 * 解析prompt中的@reference语法
 * 支持：@image_1, @video_2, @audio_1, @ref_1 (通用)
 */
export function parseReferences(prompt: string): { cleanPrompt: string; references: ParsedReference[] } {
  const refPattern = /@(image|video|audio|ref)_(\d+)/gi;
  const references: ParsedReference[] = [];
  let cleanPrompt = prompt;
  
  let match;
  while ((match = refPattern.exec(prompt)) !== null) {
    references.push({
      type: match[1] as 'image' | 'video' | 'audio',
      index: parseInt(match[2], 10),
      originalText: match[0],
    });
    cleanPrompt = cleanPrompt.replace(match[0], '').trim();
  }
  
  // 清理多余空格
  cleanPrompt = cleanPrompt.replace(/\s+/g, ' ').trim();
  
  return { cleanPrompt, references };
}

/**
 * 构建Seedance 2.0完整prompt文本
 * 结合：全局prompt + 时间轴分段 + @reference + 镜头语言
 */
export function buildEnhancedSeedancePrompt(structure: VideoPromptStructure): string {
  const parts: string[] = [];
  
  // 1. 全局基础prompt
  if (structure.globalPrompt) {
    parts.push(`[GLOBAL] ${structure.globalPrompt}`);
  }
  
  // 2. 时间轴分段
  if (structure.timeSegments.length > 0) {
    parts.push('[TIMELINE]');
    for (const segment of structure.timeSegments) {
      const segmentParts: string[] = [`${segment.start}s-${segment.end}s:`];
      segmentParts.push(segment.prompt);
      if (segment.camera) segmentParts.push(`camera: ${segment.camera}`);
      if (segment.reference) segmentParts.push(`ref: ${segment.reference}`);
      parts.push(segmentParts.join(' | '));
    }
  }
  
  // 3. @Reference引用
  const allRefs = [
    ...structure.references.images.map((_, i) => `@image_${i + 1}`),
    ...structure.references.videos.map((_, i) => `@video_${i + 1}`),
    ...structure.references.audios.map((_, i) => `@audio_${i + 1}`),
  ];
  if (allRefs.length > 0) {
    parts.push(`[REFS] ${allRefs.join(', ')}`);
  }
  
  // 4. 负面提示词
  if (structure.negativePrompt) {
    parts.push(`[NEGATIVE] ${structure.negativePrompt}`);
  }
  
  // 5. 技术参数
  const techParts: string[] = [];
  if (structure.resolution) techParts.push(`res: ${structure.resolution}`);
  if (structure.ratio) techParts.push(`ratio: ${structure.ratio}`);
  if (structure.duration) techParts.push(`dur: ${structure.duration}s`);
  if (structure.fps) techParts.push(`fps: ${structure.fps}`);
  if (structure.seed) techParts.push(`seed: ${structure.seed}`);
  if (techParts.length > 0) {
    parts.push(`[TECH] ${techParts.join(', ')}`);
  }
  
  return parts.join('\n');
}

/**
 * 从模板快速创建结构化prompt
 */
export function createPromptFromTemplate(
  templateKey: VideoTemplateKey,
  variables: Record<string, string> = {},
  references: VideoPromptStructure['references'] = { images: [], videos: [], audios: [] }
): VideoPromptStructure {
  const template = VIDEO_PROMPT_TEMPLATES[templateKey];
  
  // 替换变量
  const timeSegments = template.structure.map(seg => ({
    ...seg,
    prompt: Object.entries(variables).reduce(
      (str, [key, value]) => str.replace(new RegExp(`\\{${key}\\}`, 'g'), value),
      seg.prompt
    ),
  }));
  
  return {
    globalPrompt: `Professional video, ${template.name} style, high production quality`,
    timeSegments,
    references,
  };
}

/**
 * 获取镜头运动提示词
 */
export function getCameraMovement(key: CameraMovementKey, speed?: keyof typeof MOVEMENT_SPEEDS): string {
  const movements = CAMERA_MOVEMENTS[key];
  const movement = movements[Math.floor(Math.random() * movements.length)];
  if (speed && speed !== 'static') {
    return `${movement}, ${MOVEMENT_SPEEDS[speed]}`;
  }
  return movement;
}

/**
 * 获取镜头类型提示词
 */
export function getShotType(key: ShotTypeKey): string {
  const shots = SHOT_TYPES[key];
  return shots[Math.floor(Math.random() * shots.length)];
}

/**
 * 验证时间轴分段的有效性
 */
export function validateTimeSegments(segments: TimeSegmentPrompt[], totalDuration: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (segments.length === 0) {
    errors.push('至少需要一个时间段');
    return { valid: false, errors };
  }
  
  let prevEnd = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    
    if (seg.start < 0) {
      errors.push(`第${i + 1}段：开始时间不能小于0`);
    }
    if (seg.end > totalDuration) {
      errors.push(`第${i + 1}段：结束时间不能超过总时长${totalDuration}s`);
    }
    if (seg.start >= seg.end) {
      errors.push(`第${i + 1}段：开始时间必须小于结束时间`);
    }
    if (seg.start !== prevEnd && i > 0) {
      errors.push(`第${i + 1}段：开始时间应与前一段结束时间连续（${prevEnd}s）`);
    }
    if (!seg.prompt.trim()) {
      errors.push(`第${i + 1}段：提示词不能为空`);
    }
    
    prevEnd = seg.end;
  }
  
  if (prevEnd !== totalDuration) {
    errors.push(`最后一段结束时间（${prevEnd}s）应等于总时长（${totalDuration}s）`);
  }
  
  return { valid: errors.length === 0, errors };
}

export default {
  CAMERA_MOVEMENTS,
  SHOT_TYPES,
  MOVEMENT_SPEEDS,
  VIDEO_PROMPT_TEMPLATES,
  parseReferences,
  buildEnhancedSeedancePrompt,
  createPromptFromTemplate,
  getCameraMovement,
  getShotType,
  validateTimeSegments,
};