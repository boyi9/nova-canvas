// Nova启画 - 短剧/情景剧模板系统

export interface DramaTemplate {
  id: string;
  name: string;
  category: 'script-to-image' | 'character-design' | 'storyboard' | 'multi-episode' | 'voiceover';
  genre: 'romance' | 'comedy' | 'fantasy' | 'suspense' | 'modern';
  style: string;
  description: string;
  prompt: string;
  tags: string[];
}

// 剧本转分镜模板
export const SCRIPT_TEMPLATES: DramaTemplate[] = [
  {
    id: 'script-romance',
    name: '浪漫爱情剧',
    category: 'script-to-image',
    genre: 'romance',
    style: 'soft',
    description: '浪漫唯美的爱情故事分镜',
    prompt: 'Romantic scene, couple in {scene}, soft lighting, warm colors, emotional moment, cinematic composition, 8K',
    tags: ['爱情', '浪漫', '唯美'],
  },
  {
    id: 'script-comedy',
    name: '都市喜剧',
    category: 'script-to-image',
    genre: 'comedy',
    style: 'vibrant',
    description: '轻松幽默的都市喜剧分镜',
    prompt: 'Comedy scene, {character} in {scene}, bright colors, exaggerated expressions, fun atmosphere, sitcom style',
    tags: ['喜剧', '幽默', '都市'],
  },
  {
    id: 'script-fantasy',
    name: '奇幻仙侠',
    category: 'script-to-image',
    genre: 'fantasy',
    style: 'ethereal',
    description: '中国风仙侠奇幻分镜',
    prompt: 'Chinese fantasy scene, {character} in ancient palace, ethereal atmosphere, magical elements, traditional architecture, 8K',
    tags: ['仙侠', '奇幻', '中国风'],
  },
];

// 角色设计模板
export const CHARACTER_TEMPLATES: DramaTemplate[] = [
  {
    id: 'character-consistency',
    name: '角色一致性设计',
    category: 'character-design',
    genre: 'modern',
    style: 'consistent',
    description: '确保角色在不同场景中外观一致',
    prompt: 'Character design sheet, {character_name}, front view, side view, back view, consistent style, detailed, professional',
    tags: ['角色', '一致性', '设计'],
  },
  {
    id: 'character-expression',
    name: '角色表情包',
    category: 'character-design',
    genre: 'modern',
    style: 'expressive',
    description: '角色不同表情和动作的设计',
    prompt: 'Character expression sheet, {character_name}, happy, sad, angry, surprised, detailed expressions, anime style',
    tags: ['表情', '角色', '动漫'],
  },
];

// 分镜模板
export const STORYBOARD_TEMPLATES: DramaTemplate[] = [
  {
    id: 'storyboard-9grid',
    name: '九宫格分镜',
    category: 'storyboard',
    genre: 'modern',
    style: 'grid',
    description: '9个分镜展示完整场景',
    prompt: 'Storyboard grid, 9 panels, {scene_description}, sequential storytelling, professional layout',
    tags: ['分镜', '九宫格', '故事'],
  },
  {
    id: 'storyboard-25grid',
    name: '25宫格分镜',
    category: 'storyboard',
    genre: 'modern',
    style: 'grid',
    description: '25个分镜展示详细剧情',
    prompt: 'Detailed storyboard, 25 panels, {scene_description}, shot-by-shot breakdown, cinematic sequence',
    tags: ['分镜', '25宫格', '详细'],
  },
];

// 多集编排模板
export const MULTI_EPISODE_TEMPLATES: DramaTemplate[] = [
  {
    id: 'multi-episode-series',
    name: '系列剧集编排',
    category: 'multi-episode',
    genre: 'modern',
    style: 'series',
    description: '多集连续剧情编排',
    prompt: 'Episode series, {episode_count} episodes, consistent characters, progressive storyline, professional script structure',
    tags: ['剧集', '系列', '连续'],
  },
];

// 配音配乐模板
export const VOICEOVER_TEMPLATES: DramaTemplate[] = [
  {
    id: 'voiceover-narrator',
    name: '旁白配音',
    category: 'voiceover',
    genre: 'modern',
    style: 'narrative',
    description: '剧情旁白和解说配音',
    prompt: 'Narrative voiceover, {text}, emotional delivery, professional tone, background music',
    tags: ['配音', '旁白', '叙事'],
  },
];

/**
 * 根据类型获取短剧模板
 */
export function getTemplatesByCategory(category: string): DramaTemplate[] {
  const allTemplates = [
    ...SCRIPT_TEMPLATES,
    ...CHARACTER_TEMPLATES,
    ...STORYBOARD_TEMPLATES,
    ...MULTI_EPISODE_TEMPLATES,
    ...VOICEOVER_TEMPLATES,
  ];
  return allTemplates.filter((t) => t.category === category);
}

/**
 * 根据类型获取模板
 */
export function getTemplatesByGenre(genre: string): DramaTemplate[] {
  const allTemplates = [
    ...SCRIPT_TEMPLATES,
    ...CHARACTER_TEMPLATES,
    ...STORYBOARD_TEMPLATES,
    ...MULTI_EPISODE_TEMPLATES,
    ...VOICEOVER_TEMPLATES,
  ];
  return allTemplates.filter((t) => t.genre === genre);
}

/**
 * 生成短剧提示词
 */
export function generateDramaPrompt(
  template: DramaTemplate,
  context: {
    character_name?: string;
    scene?: string;
    scene_description?: string;
    episode_count?: number;
    text?: string;
  },
  additionalContext?: string
): string {
  let prompt = template.prompt
    .replace(/\{character_name\}/g, context.character_name || 'Character')
    .replace(/\{character\}/g, context.character_name || 'Character')
    .replace(/\{scene\}/g, context.scene || 'scene')
    .replace(/\{scene_description\}/g, context.scene_description || 'scene description')
    .replace(/\{episode_count\}/g, String(context.episode_count || 1))
    .replace(/\{text\}/g, context.text || 'narration');
  if (additionalContext) {
    prompt += `, ${additionalContext}`;
  }
  return prompt;
}

export default {
  SCRIPT_TEMPLATES,
  CHARACTER_TEMPLATES,
  STORYBOARD_TEMPLATES,
  MULTI_EPISODE_TEMPLATES,
  VOICEOVER_TEMPLATES,
  getTemplatesByCategory,
  getTemplatesByGenre,
  generateDramaPrompt,
};
