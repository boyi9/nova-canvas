// Nova启画 - 电商主图模板系统（含25套ecom-details-image场景 + Campaign Style Lock）

export interface EcommerceTemplate {
  id: string;
  name: string;
  category: 'main-image' | 'detail-page' | 'promo-video' | 'lifestyle' | 'social-media';
  platform: 'taobao' | 'jd' | 'pdd' | 'douyin' | 'xiaohongshu' | 'wechat' | 'all';
  width: number;
  height: number;
  style: string;
  description: string;
  prompt: string;
  tags: string[];
  // Campaign Style Lock fields
  styleLock?: {
    colorPalette: string[];
    lightingStyle: string;
    composition: string;
    backgroundType: string;
  };
  // Conversion-driven diagnosis tags
  diagnosis?: {
    visualAppeal: number;    // 1-10 视觉吸引力
    painPointCoverage: number; // 1-10 痛点覆盖
    emotionalConnection: number; // 1-10 情感连接
  };
}

const CAMPAIGN_STYLE_DEFAULTS = {
  colorPalette: ['#FFFFFF', '#F5F5F5', '#E8E8E8', '#333333'],
  lightingStyle: 'studio-softbox',
  composition: 'rule-of-thirds',
  backgroundType: 'clean-gradient',
};

// === 淘宝/天猫主图模板 (800x800) ===
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
    styleLock: CAMPAIGN_STYLE_DEFAULTS,
    diagnosis: { visualAppeal: 8, painPointCoverage: 6, emotionalConnection: 5 },
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
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, backgroundType: 'lifestyle-room', lightingStyle: 'natural-window' },
    diagnosis: { visualAppeal: 9, painPointCoverage: 7, emotionalConnection: 8 },
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
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, colorPalette: ['#1A1A1A', '#D4AF37', '#F5F5F5'], lightingStyle: 'dramatic-rim', composition: 'centered', backgroundType: 'marble-texture' },
    diagnosis: { visualAppeal: 10, painPointCoverage: 8, emotionalConnection: 9 },
  },
  {
    id: 'taobao-closeup',
    name: '特写细节主图',
    category: 'main-image',
    platform: 'taobao',
    width: 800,
    height: 800,
    style: 'macro',
    description: '微距展示材质细节，适合纺织/皮革/工艺品',
    prompt: 'Extreme close-up macro photography of {product_name}, showing texture details, fabric weave, material quality, studio macro lens, f/2.8, commercial',
    tags: ['微距', '细节', '材质'],
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, composition: 'fill-frame', backgroundType: 'solid-neutral' },
    diagnosis: { visualAppeal: 7, painPointCoverage: 9, emotionalConnection: 6 },
  },
  {
    id: 'taobao-flatlay',
    name: '平铺搭配主图',
    category: 'main-image',
    platform: 'taobao',
    width: 800,
    height: 800,
    style: 'flatlay',
    description: '多产品平铺搭配，适合套装/礼盒/系列产品',
    prompt: 'Flat lay photography of {product_name} with complementary accessories, top-down view, clean arrangement, soft shadows, minimal aesthetic, commercial',
    tags: ['平铺', '搭配', '套装'],
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, composition: 'flatlay-grid', backgroundType: 'textured-paper' },
    diagnosis: { visualAppeal: 8, painPointCoverage: 7, emotionalConnection: 7 },
  },
];

// === 京东主图模板 (800x800) ===
export const JD_MAIN_TEMPLATES: EcommerceTemplate[] = [
  {
    id: 'jd-tech',
    name: '科技感主图',
    category: 'main-image',
    platform: 'jd',
    width: 800,
    height: 800,
    style: 'tech',
    description: '未来感科技风，适合电子/数码/智能硬件',
    prompt: '{product_name} floating in futuristic holographic display, neon blue accents, cyberpunk aesthetic, volumetric lighting, 8K render, tech commercial',
    tags: ['科技', '未来', '数码'],
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, colorPalette: ['#0A0A0A', '#00FFFF', '#FFFFFF', '#1A1A2E'], lightingStyle: 'neon-rim', composition: 'floating-center', backgroundType: 'dark-gradient' },
    diagnosis: { visualAppeal: 9, painPointCoverage: 8, emotionalConnection: 7 },
  },
  {
    id: 'jd-split',
    name: '分屏对比主图',
    category: 'main-image',
    platform: 'jd',
    width: 800,
    height: 800,
    style: 'comparison',
    description: '前后对比/规格对比，适合净化器/美容仪/清洁类',
    prompt: 'Split screen comparison, left: before using {product_name}, right: after, dramatic difference, professional lighting, commercial quality, 8K',
    tags: ['对比', '效果', '前后'],
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, composition: 'vertical-split', backgroundType: 'clean-gradient' },
    diagnosis: { visualAppeal: 8, painPointCoverage: 10, emotionalConnection: 8 },
  },
];

// === 拼多多主图模板 (800x800) ===
export const PDD_MAIN_TEMPLATES: EcommerceTemplate[] = [
  {
    id: 'pdd-highlight',
    name: '卖点高亮主图',
    category: 'main-image',
    platform: 'pdd',
    width: 800,
    height: 800,
    style: 'highlight',
    description: '大字标注核心卖点，适合价格敏感型产品',
    prompt: '{product_name} product photo with bold callout text overlay "核心卖点", clean background, high contrast, commercial e-commerce style',
    tags: ['卖点', '大字', '促销'],
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, colorPalette: ['#FF4444', '#FFFFFF', '#FFEB3B'], lightingStyle: 'high-key', composition: 'text-overlay' },
    diagnosis: { visualAppeal: 7, painPointCoverage: 9, emotionalConnection: 6 },
  },
  {
    id: 'pdd-bundle',
    name: '组合装主图',
    category: 'main-image',
    platform: 'pdd',
    width: 800,
    height: 800,
    style: 'bundle',
    description: '多规格组合展示，适合日用消耗品',
    prompt: 'Product bundle shot of {product_name} multiple variants arranged neatly, value pack presentation, clean background, commercial photography',
    tags: ['组合', '实惠', '多规格'],
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, composition: 'grid-arrangement', backgroundType: 'clean-white' },
    diagnosis: { visualAppeal: 7, painPointCoverage: 8, emotionalConnection: 6 },
  },
];

// === 抖音短视频/直播封面模板 (1080x1920竖版) ===
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
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, composition: 'vertical-center', backgroundType: 'studio-cyc' },
    diagnosis: { visualAppeal: 9, painPointCoverage: 7, emotionalConnection: 8 },
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
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, lightingStyle: 'golden-hour', backgroundType: 'home-interior', composition: 'rule-of-thirds' },
    diagnosis: { visualAppeal: 9, painPointCoverage: 6, emotionalConnection: 10 },
  },
  {
    id: 'douyin-unboxing',
    name: '开箱体验短视频',
    category: 'promo-video',
    platform: 'douyin',
    width: 1080,
    height: 1920,
    style: 'unboxing',
    description: '真实开箱过程，建立信任感，适合高客单价产品',
    prompt: 'Authentic unboxing video of {product_name}, hands opening premium packaging, slow reveal, ASMR style, vertical format, genuine reaction',
    tags: ['开箱', '信任', '真实'],
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, lightingStyle: 'soft-diffused', backgroundType: 'clean-table', composition: 'hands-pov' },
    diagnosis: { visualAppeal: 8, painPointCoverage: 7, emotionalConnection: 9 },
  },
  {
    id: 'douyin-beforeafter',
    name: '前后对比短视频',
    category: 'promo-video',
    platform: 'douyin',
    width: 1080,
    height: 1920,
    style: 'transformation',
    description: '使用前后强烈对比，适合美容/清洁/整理类',
    prompt: 'Before/after transformation video, split screen vertical, left: problem state, right: {product_name} solution, dramatic reveal, upbeat transition',
    tags: ['对比', '转化', '效果'],
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, composition: 'vertical-split', backgroundType: 'split-gradient' },
    diagnosis: { visualAppeal: 9, painPointCoverage: 10, emotionalConnection: 8 },
  },
];

// === 小红书种草模板 (1080x1350 / 1080x1080) ===
export const XIAOHONGSHU_TEMPLATES: EcommerceTemplate[] = [
  {
    id: 'xhs-aesthetic',
    name: '高颜值种草图',
    category: 'main-image',
    platform: 'xiaohongshu',
    width: 1080,
    height: 1350,
    style: 'aesthetic',
    description: 'ins风高颜值，适合美妆/护肤/家居好物',
    prompt: '{product_name} aesthetic flat lay, pastel color palette, dried flowers, minimal props, soft natural lighting, instagram style, high engagement',
    tags: ['ins风', '高颜值', '种草'],
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, colorPalette: ['#FFF5F5', '#FFE4E1', '#F0E6FF', '#E6F3FF'], lightingStyle: 'soft-natural', composition: 'flatlay-aesthetic', backgroundType: 'textured-fabric' },
    diagnosis: { visualAppeal: 10, painPointCoverage: 6, emotionalConnection: 9 },
  },
  {
    id: 'xhs-review',
    name: '真实测评图',
    category: 'main-image',
    platform: 'xiaohongshu',
    width: 1080,
    height: 1350,
    style: 'review',
    description: '手持/使用特写，真实质感，建立信任',
    prompt: 'Hand holding {product_name}, close-up genuine texture, skin contact, natural light, authentic review style, unfiltered look, vertical',
    tags: ['测评', '手持', '真实'],
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, lightingStyle: 'window-light', composition: 'hand-held-closeup', backgroundType: 'blurred-home' },
    diagnosis: { visualAppeal: 8, painPointCoverage: 7, emotionalConnection: 10 },
  },
];

// === 微信视频号/朋友圈模板 (1080x1920) ===
export const WECHAT_TEMPLATES: EcommerceTemplate[] = [
  {
    id: 'wechat-moment',
    name: '朋友圈推广图',
    category: 'social-media',
    platform: 'wechat',
    width: 1080,
    height: 1920,
    style: 'social',
    description: '适合私域转发，强调社交证明',
    prompt: '{product_name} lifestyle shot with social proof elements, user reviews overlay, trust badges, warm lighting, vertical mobile format',
    tags: ['私域', '转发', '信任'],
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, composition: 'mobile-story', backgroundType: 'lifestyle-blur' },
    diagnosis: { visualAppeal: 7, painPointCoverage: 7, emotionalConnection: 8 },
  },
];

// === 详情页模板 ===
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
    styleLock: CAMPAIGN_STYLE_DEFAULTS,
    diagnosis: { visualAppeal: 8, painPointCoverage: 8, emotionalConnection: 7 },
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
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, composition: 'long-scroll-narrative' },
    diagnosis: { visualAppeal: 9, painPointCoverage: 7, emotionalConnection: 9 },
  },
  {
    id: 'detail-tech',
    name: '参数规格详情页',
    category: 'detail-page',
    platform: 'all',
    width: 750,
    height: 3000,
    style: 'technical',
    description: '重参数/规格对比，适合3C数码/家电',
    prompt: 'Technical product detail page, detailed specifications table, feature comparison charts, exploded view diagrams, clean data visualization',
    tags: ['参数', '规格', '对比'],
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, colorPalette: ['#0D1117', '#58A6FF', '#FFFFFF', '#8B949E'], lightingStyle: 'clinical', composition: 'data-driven' },
    diagnosis: { visualAppeal: 7, painPointCoverage: 10, emotionalConnection: 5 },
  },
  {
    id: 'detail-video',
    name: '视频化详情页',
    category: 'detail-page',
    platform: 'all',
    width: 750,
    height: 3000,
    style: 'video-rich',
    description: '嵌入短视频演示，提升停留转化',
    prompt: 'Video-rich product detail page, embedded product demo videos, GIF animations, interactive 360 view, mobile-first vertical layout',
    tags: ['视频', '演示', '互动'],
    styleLock: { ...CAMPAIGN_STYLE_DEFAULTS, composition: 'video-first' },
    diagnosis: { visualAppeal: 9, painPointCoverage: 8, emotionalConnection: 8 },
  },
];

// === 所有模板汇总 ===
export const ALL_ECOMMERCE_TEMPLATES = [
  ...TAOBAO_MAIN_TEMPLATES,
  ...JD_MAIN_TEMPLATES,
  ...PDD_MAIN_TEMPLATES,
  ...DOUYIN_VIDEO_TEMPLATES,
  ...XIAOHONGSHU_TEMPLATES,
  ...WECHAT_TEMPLATES,
  ...DETAIL_PAGE_TEMPLATES,
];

/**
 * 根据平台和类型获取模板
 */
export function getTemplatesByPlatform(
  platform: string,
  category?: string
): EcommerceTemplate[] {
  return ALL_ECOMMERCE_TEMPLATES.filter((t) => {
    const platformMatch = t.platform === platform || t.platform === 'all';
    const categoryMatch = !category || t.category === category;
    return platformMatch && categoryMatch;
  });
}

/**
 * 获取Campaign Style Lock配置
 * 用于多图风格一致性生成
 */
export function getCampaignStyleLock(templateId: string): EcommerceTemplate['styleLock'] | undefined {
  const template = ALL_ECOMMERCE_TEMPLATES.find(t => t.id === templateId);
  return template?.styleLock;
}

/**
 * 生成电商提示词（支持Style Lock注入）
 */
export function generateEcommercePrompt(
  template: EcommerceTemplate,
  productName: string,
  additionalContext?: string,
  options?: { applyStyleLock?: boolean }
): string {
  let prompt = template.prompt.replace(/\{product_name\}/g, productName);
  
  if (options?.applyStyleLock && template.styleLock) {
    const lock = template.styleLock;
    prompt += `, color palette: ${lock.colorPalette.join(', ')}, lighting: ${lock.lightingStyle}, composition: ${lock.composition}, background: ${lock.backgroundType}`;
  }
  
  if (additionalContext) {
    prompt += `, ${additionalContext}`;
  }
  return prompt;
}

/**
 * 诊断模板转化潜力
 */
export function diagnoseTemplate(template: EcommerceTemplate): { score: number; suggestions: string[] } {
  const d = template.diagnosis;
  if (!d) return { score: 0, suggestions: [] };
  
  const score = Math.round((d.visualAppeal + d.painPointCoverage + d.emotionalConnection) / 3 * 10);
  const suggestions: string[] = [];
  
  if (d.visualAppeal < 8) suggestions.push('建议增强视觉冲击力：更强的对比度或独特构图');
  if (d.painPointCoverage < 8) suggestions.push('建议强化卖点展示：增加前后对比或特写细节');
  if (d.emotionalConnection < 8) suggestions.push('建议增加情感连接：加入使用场景或真实人物');
  
  return { score, suggestions };
}

export default {
  TAOBAO_MAIN_TEMPLATES,
  JD_MAIN_TEMPLATES,
  PDD_MAIN_TEMPLATES,
  DOUYIN_VIDEO_TEMPLATES,
  XIAOHONGSHU_TEMPLATES,
  WECHAT_TEMPLATES,
  DETAIL_PAGE_TEMPLATES,
  ALL_ECOMMERCE_TEMPLATES,
  getTemplatesByPlatform,
  getCampaignStyleLock,
  generateEcommercePrompt,
  diagnoseTemplate,
};
