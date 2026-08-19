// Nova启画 - 电商主图模板系统

export interface EcommerceTemplate {
  id: string;
  name: string;
  category: 'main-image' | 'detail-page' | 'promo-video';
  platform: 'taobao' | 'jd' | 'pdd' | 'douyin' | 'all';
  width: number;
  height: number;
  style: string;
  description: string;
  prompt: string;
  tags: string[];
}

// 淘宝/天猫主图模板 (800x800)
export const TAOBAO_MAIN_TEMPLATES: EcommerceTemplate[] = [
  {
    id: 'taobao-minimalist',
    name: '简约白底主图',
    category: 'main-image',
    platform: 'taobao',
    width: 800,
    height: 800,
    style: 'minimalist',
    description: '纯白背景突出产品，适合3C数码/家居用品',
    prompt: 'Professional product photography, {product_name} on pure white background, studio lighting, commercial quality, 8K, sharp focus',
    tags: ['白底', '简约', '专业'],
  },
  {
    id: 'taobao-scene',
    name: '生活场景主图',
    category: 'main-image',
    platform: 'taobao',
    width: 800,
    height: 800,
    style: 'lifestyle',
    description: '产品融入生活场景，适合家居/食品/日用品',
    prompt: '{product_name} in modern living room, natural lighting, lifestyle photography, warm atmosphere, commercial quality, 8K',
    tags: ['场景', '生活', '温馨'],
  },
  {
    id: 'taobao-luxury',
    name: '高端质感主图',
    category: 'main-image',
    platform: 'taobao',
    width: 800,
    height: 800,
    style: 'luxury',
    description: '奢华质感，适合美妆/珠宝/高端产品',
    prompt: '{product_name} on marble surface, golden accents, luxury product photography, dramatic lighting, 8K, high-end commercial',
    tags: ['高端', '奢华', '质感'],
  },
];

// 抖音短视频主图模板 (1080x1920竖版)
export const DOUYIN_VIDEO_TEMPLATES: EcommerceTemplate[] = [
  {
    id: 'douyin-product-showcase',
    name: '产品展示短视频',
    category: 'promo-video',
    platform: 'douyin',
    width: 1080,
    height: 1920,
    style: 'dynamic',
    description: '15-60秒产品展示视频，适合带货直播',
    prompt: 'Dynamic product showcase video, {product_name}, 360 degree rotation, modern studio, upbeat music, professional lighting',
    tags: ['短视频', '动态', '展示'],
  },
  {
    id: 'douyin-lifestyle',
    name: '生活方式短视频',
    category: 'promo-video',
    platform: 'douyin',
    width: 1080,
    height: 1920,
    style: 'lifestyle',
    description: '场景化产品使用视频，适合日用消费品',
    prompt: 'Lifestyle video, person using {product_name}, natural setting, warm tone, authentic feeling, vertical format',
    tags: ['生活', '自然', '真实'],
  },
];

// 详情页模板
export const DETAIL_PAGE_TEMPLATES: EcommerceTemplate[] = [
  {
    id: 'detail-modern',
    name: '现代简约详情页',
    category: 'detail-page',
    platform: 'all',
    width: 750,
    height: 3000,
    style: 'modern',
    description: '模块化详情页，突出产品卖点',
    prompt: 'Modern product detail page design, clean layout, feature highlights, specification table, trust badges, professional e-commerce design',
    tags: ['现代', '模块化', '专业'],
  },
  {
    id: 'detail-storytelling',
    name: '故事型详情页',
    category: 'detail-page',
    platform: 'all',
    width: 750,
    height: 3000,
    style: 'storytelling',
    description: '以故事形式展示产品，适合品牌产品',
    prompt: 'Storytelling product detail page, brand narrative, lifestyle imagery, emotional connection, premium design',
    tags: ['故事', '品牌', '情感'],
  },
];

/**
 * 根据平台和类型获取模板
 */
export function getTemplatesByPlatform(
  platform: string,
  category?: string
): EcommerceTemplate[] {
  const allTemplates = [
    ...TAOBAO_MAIN_TEMPLATES,
    ...DOUYIN_VIDEO_TEMPLATES,
    ...DETAIL_PAGE_TEMPLATES,
  ];

  return allTemplates.filter((t) => {
    const platformMatch = t.platform === platform || t.platform === 'all';
    const categoryMatch = !category || t.category === category;
    return platformMatch && categoryMatch;
  });
}

/**
 * 生成电商提示词
 */
export function generateEcommercePrompt(
  template: EcommerceTemplate,
  productName: string,
  additionalContext?: string
): string {
  let prompt = template.prompt.replace(/\{product_name\}/g, productName);
  if (additionalContext) {
    prompt += `, ${additionalContext}`;
  }
  return prompt;
}

export default {
  TAOBAO_MAIN_TEMPLATES,
  DOUYIN_VIDEO_TEMPLATES,
  DETAIL_PAGE_TEMPLATES,
  getTemplatesByPlatform,
  generateEcommercePrompt,
};
