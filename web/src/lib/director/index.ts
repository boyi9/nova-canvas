// Nova Canvas - 编导知识库规则引擎
// 供 Director Agent 调用，提供镜头语言规则查询与分镜校验

import shotFunctions from './rules/shot_functions.json';
import shotScale from './rules/shot_scale.json';
import cameraMoves from './rules/camera_moves.json';
import rhythm from './rules/rhythm.json';
import axisRules from './rules/axis_rules.json';

export interface ShotFunctionLevel {
  level: number;
  name: string;
  ratio: string;
  desc: string;
  examples: string[];
}

export interface ShotScale {
  id: string;
  name: string;
  subject_ratio: string;
  function: string;
  duration_hint: string;
}

export interface CameraMove {
  id: string;
  cn: string;
  prompt: string;
  use: string;
}

export interface RhythmRules {
  golden_3_seconds: {
    rule: string;
    hook_types: string[];
  };
  shot_duration: {
    normal: string;
    fast_paced: string;
    emotional: string;
  };
  structure_15s: string[];
  structure_30s: string[];
  bgm_matching: {
    bpm_map: Record<string, string>;
  };
}

export interface AxisRules {
  axis_180: string;
  composition: {
    rule_of_thirds: string;
    center_symmetry: string;
    leading_lines: string;
    negative_space: string;
  };
  lighting_hints: Record<string, string>;
}

export interface DirectorShot {
  id: string;
  index: number;
  duration: number;
  shotType: string;
  cameraMove: string;
  angle: string;
  content: string;
  dialogue?: string;
  voiceover?: string;
  sound: {
    sfx?: string;
    bgm: string;
    bgmBpm?: number;
  };
  emotion: string;
  function: 'narrative' | 'emotion' | 'transition' | 'effect';
  hook?: boolean;
  refImageId?: string;
  promptEn?: string;
  thumbUrl?: string;
  status: 'draft' | 'generating' | 'done' | 'failed';
}

export interface StoryboardValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  suggestions: string[];
}

// 缓存的规则数据
const RULES = {
  shot_functions: shotFunctions as { shot_function_levels: ShotFunctionLevel[] },
  shot_scale: shotScale as { scales: ShotScale[]; pacing_rule: string },
  camera_moves: cameraMoves as { moves: CameraMove[] },
  rhythm: rhythm as RhythmRules,
  axis_rules: axisRules as AxisRules,
};

/**
 * 获取指定类别的规则
 */
export function getRules(category: keyof typeof RULES) {
  return RULES[category];
}

/**
 * 获取镜头功能分级规则
 */
export function getShotFunctionRules() {
  return RULES.shot_functions.shot_function_levels;
}

/**
 * 获取景别规则
 */
export function getShotScaleRules() {
  return RULES.shot_scale.scales;
}

/**
 * 获取运镜规则
 */
export function getCameraMoveRules() {
  return RULES.camera_moves.moves;
}

/**
 * 获取节奏规则
 */
export function getRhythmRules() {
  return RULES.rhythm;
}

/**
 * 获取轴线/构图规则
 */
export function getAxisRules() {
  return RULES.axis_rules;
}

/**
 * 根据运镜 ID 获取中文名和提示词
 */
export function getCameraMoveById(id: string): CameraMove | undefined {
  return RULES.camera_moves.moves.find(m => m.id === id);
}

/**
 * 根据景别 ID 获取规则
 */
export function getShotScaleById(id: string): ShotScale | undefined {
  return RULES.shot_scale.scales.find(s => s.id === id);
}

/**
 * 根据镜头功能级别获取规则
 */
export function getShotFunctionByLevel(level: number): ShotFunctionLevel | undefined {
  return RULES.shot_functions.shot_function_levels.find(l => l.level === level);
}

/**
 * 校验分镜表是否符合编导规范
 */
export function validateStoryboard(storyboard: DirectorShot[]): StoryboardValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const suggestions: string[] = [];

  if (storyboard.length === 0) {
    errors.push('分镜表为空');
    return { valid: false, warnings, errors, suggestions };
  }

  // 1. 检查钩子镜头（前3秒必须有钩子）
  const hookShots = storyboard.filter(s => s.hook === true);
  const firstThreeSeconds = storyboard.filter(s => (s.index ?? 0) < 3 || s.duration <= 3);
  if (hookShots.length === 0 && firstThreeSeconds.length > 0) {
    warnings.push('前3秒缺少钩子镜头，建议添加冲突/悬念/反差/痛点/福利类钩子');
  }

  // 2. 检查景别多样性
  const shotTypes = new Set(storyboard.map(s => s.shotType));
  if (shotTypes.size < 3) {
    warnings.push(`景别单一（仅 ${shotTypes.size} 种），建议包含全景/中景/近景/特写至少 3 种`);
  }
  if (!shotTypes.has('wide') && !shotTypes.has('extreme-wide')) {
    suggestions.push('缺少环境交代镜头（全景/大远景），建议开头加入环境空镜');
  }
  if (!shotTypes.has('close-up') && !shotTypes.has('extreme-close-up')) {
    suggestions.push('缺少特写镜头，建议在卖点/情绪处加入近景/特写');
  }

  // 3. 检查镜头时长分布
  const totalDuration = storyboard.reduce((sum, s) => sum + s.duration, 0);
  const avgDuration = totalDuration / storyboard.length;
  if (avgDuration < 1.5) {
    warnings.push(`平均镜头时长 ${avgDuration.toFixed(1)}s 过短，信息可能无法传达`);
  }
  if (avgDuration > 6) {
    warnings.push(`平均镜头时长 ${avgDuration.toFixed(1)}s 过长，节奏可能拖沓`);
  }

  // 4. 检查功能级别分布
  const functionCounts = storyboard.reduce((acc, s) => {
    acc[s.function] = (acc[s.function] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const narrativeRatio = (functionCounts.narrative || 0) / storyboard.length;
  if (narrativeRatio < 0.4) {
    suggestions.push('叙事主镜头占比较低（<40%），建议增加推进情节的镜头');
  }

  // 5. 检查运镜多样性
  const cameraMovesSet = new Set(storyboard.map(s => s.cameraMove));
  if (cameraMovesSet.size === 1 && storyboard.length > 3) {
    suggestions.push('全片运镜单一，建议混合使用推/拉/摇/移/环绕/固定等运镜');
  }

  // 6. 检查越轴风险（简化：检查是否有连续的 left/right 摇镜且无中性过渡）
  for (let i = 1; i < storyboard.length; i++) {
    const prev = storyboard[i - 1].cameraMove;
    const curr = storyboard[i].cameraMove;
    if ((prev === 'pan-left' && curr === 'pan-right') || (prev === 'pan-right' && curr === 'pan-left')) {
      warnings.push(`镜头 ${i} 与 ${i + 1} 存在左右摇镜切换，可能越轴，建议插入中性镜头（特写/空镜）过渡`);
    }
  }

  // 7. 检查 BPM 匹配
  const bgmBpms = storyboard.filter(s => s.sound?.bgmBpm).map(s => s.sound!.bgmBpm!);
  if (bgmBpms.length > 0) {
    const avgBpm = bgmBpms.reduce((a, b) => a + b, 0) / bgmBpms.length;
    if (avgBpm > 130) {
      suggestions.push(`平均 BPM ${Math.round(avgBpm)} 较高，适合快节奏 UGC，确认是否符合品牌调性`);
    } else if (avgBpm < 70) {
      suggestions.push(`平均 BPM ${Math.round(avgBpm)} 较低，适合品牌/氛围向，确认是否符合电商带货节奏`);
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    suggestions
  };
}

/**
 * 将分镜编译为模型提示词
 */
export function buildShotPrompt(shot: DirectorShot, modelHint?: 'nova_reel' | 'seedance' | 'kling' | 'wan'): string {
  const MODEL_HINTS: Record<string, { prefix: string; suffix: string }> = {
    nova_reel: { prefix: 'Cinematic e-commerce ad shot. ', suffix: ' High production quality, consistent branding, 1080p.' },
    seedance: { prefix: '电商广告镜头。', suffix: ' 画面真实自然，产品细节清晰，中文场景。' },
    kling: { prefix: 'Film-quality shot, ', suffix: ' smooth motion, dramatic lighting.' },
    wan: { prefix: '写实商品短视频镜头，', suffix: ' 运镜平滑，色彩准确。' },
  };

  const hint = modelHint ? MODEL_HINTS[modelHint] : { prefix: '', suffix: '' };
  
  const parts: string[] = [];
  
  // 模型特定前缀
  if (hint.prefix) parts.push(hint.prefix);
  
  // 核心画面描述
  parts.push(shot.content);
  
  // 镜头语言
  const scale = getShotScaleById(shot.shotType);
  const move = getCameraMoveById(shot.cameraMove);
  
  if (scale) parts.push(`${scale.name} (${scale.subject_ratio})`);
  if (move) parts.push(`${move.cn}: ${move.prompt}`);
  if (shot.angle) parts.push(`角度: ${shot.angle}`);
  
  // 时长
  parts.push(`时长 ${shot.duration}s`);
  
  // 声音
  if (shot.sound) {
    if (shot.sound.bgm) parts.push(`BGM: ${shot.sound.bgm}`);
    if (shot.sound.bgmBpm) parts.push(`BPM: ${shot.sound.bgmBpm}`);
    if (shot.sound.sfx) parts.push(`音效: ${shot.sound.sfx}`);
  }
  
  // 情绪
  if (shot.emotion) parts.push(`情绪: ${shot.emotion}`);
  
  // 一致性锁定
  if (shot.refImageId) parts.push(`参考图: ${shot.refImageId}`);
  
  // 功能级别
  parts.push(`功能: ${shot.function}`);
  
  // 模型特定后缀
  if (hint.suffix) parts.push(hint.suffix);
  
  return parts.join(' | ');
}

/**
 * 批量编译分镜表为各模型提示词数组
 */
export function compileStoryboardPrompts(storyboard: DirectorShot[], modelHint?: 'nova_reel' | 'seedance' | 'kling' | 'wan'): string[] {
  return storyboard.map(shot => buildShotPrompt(shot, modelHint));
}

export default {
  getRules,
  getShotFunctionRules,
  getShotScaleRules,
  getCameraMoveRules,
  getRhythmRules,
  getAxisRules,
  getCameraMoveById,
  getShotScaleById,
  getShotFunctionByLevel,
  validateStoryboard,
  buildShotPrompt,
  compileStoryboardPrompts,
};