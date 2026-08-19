// Nova启画 - 广告/宣传片模板系统

export interface AdvertisingTemplate {
  id: string;
  name: string;
  category: 'tvc' | 'brand' | 'social' | 'holiday';
  duration: number; // 秒
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
  style: string;
  description: string;
  prompt: string;
  tags: string[];
}

// TVC广告模板
export const TVC_TEMPLATES: AdvertisingTemplate[] = [
  {
    id: 'tvc-product-hero',
    name: '产品英雄镜头',
    category: 'tvc',
    duration: 15,
    aspectRatio: '16:9',
    style: 'cinematic',
    description: '产品特写+动态展示，适合30秒TVC',
    prompt: 'Cinematic product hero shot, {product_name}, dramatic lighting, slow motion reveal, professional commercial, 4K quality',
    tags: ['TVC', '电影级', '产品'],
  },
  {
    id: 'tvc-story',
    name: '故事型TVC',
    category: 'tvc',
    duration: 30,
    aspectRatio: '16:9',
    style: 'narrative',
    description: '带故事情节的品牌TVC',
    prompt: 'Brand storytelling commercial, emotional narrative, {brand_name}, cinematic color grading, professional voiceover',
    tags: ['TVC', '故事', '品牌'],
  },
];

// 品牌宣传片模板
export const BRAND_TEMPLATES: AdvertisingTemplate[] = [
  {
    id: 'brand-corporate',
    name: '企业宣传片',
    category: 'brand',
    duration: 60,
    aspectRatio: '16:9',
    style: 'corporate',
    description: '企业形象宣传片，适合官网/展会',
    prompt: 'Corporate brand video, {company_name}, modern office, professional team, innovation, technology, premium quality',
    tags: ['企业', '专业', '形象'],
  },
  {
    id: 'brand-story',
    name: '品牌故事片',
    category: 'brand',
    duration: 90,
    aspectRatio: '16:9',
    style: 'emotional',
    description: '品牌理念与价值观传达',
    prompt: 'Brand story video, {brand_name}, authentic moments, emotional connection, documentary style, inspiring',
    tags: ['品牌', '故事', '情感'],
  },
];

// 社交媒体短视频模板
export const SOCIAL_TEMPLATES: AdvertisingTemplate[] = [
  {
    id: 'social-douyin',
    name: '抖音带货视频',
    category: 'social',
    duration: 15,
    aspectRatio: '9:16',
    style: 'energetic',
    description: '快节奏产品展示，适合抖音/快手',
    prompt: 'Fast-paced product showcase, vertical format, trendy music, eye-catching effects, {product_name}, viral potential',
    tags: ['抖音', '快手', '带货'],
  },
  {
    id: 'social-xiaohongshu',
    name: '小红书种草视频',
    category: 'social',
    duration: 30,
    aspectRatio: '3:4',
    style: 'aesthetic',
    description: '精致生活方式，适合小红书/微博',
    prompt: 'Aesthetic lifestyle video, {product_name}, soft lighting, pastel tones, Instagram-worthy, trendy and chic',
    tags: ['小红书', '种草', '精致'],
  },
];

// 节日营销模板
export const HOLIDAY_TEMPLATES: AdvertisingTemplate[] = [
  {
    id: 'holiday-spring',
    name: '春节营销',
    category: 'holiday',
    duration: 15,
    aspectRatio: '16:9',
    style: 'festive',
    description: '春节主题营销视频',
    prompt: 'Chinese New Year promotional video, red and gold theme, festive atmosphere, {product_name}, lucky symbols, celebration',
    tags: ['春节', '节日', '喜庆'],
  },
  {
    id: 'holiday-double11',
    name: '双11大促',
    category: 'holiday',
    duration: 10,
    aspectRatio: '16:9',
    style: 'promotional',
    description: '双11促销倒计时视频',
    prompt: 'Double 11 sale countdown, dynamic text, exciting music, {product_name}, limited time offer, call to action',
    tags: ['双11', '促销', '倒计时'],
  },
];

/**
 * 根据类型获取广告模板
 */
export function getTemplatesByCategory(category: string): AdvertisingTemplate[] {
  const allTemplates = [
    ...TVC_TEMPLATES,
    ...BRAND_TEMPLATES,
    ...SOCIAL_TEMPLATES,
    ...HOLIDAY_TEMPLATES,
  ];
  return allTemplates.filter((t) => t.category === category);
}

/**
 * 生成广告提示词
 */
export function generateAdPrompt(
  template: AdvertisingTemplate,
  productName: string,
  brandName?: string,
  additionalContext?: string
): string {
  let prompt = template.prompt
    .replace(/\{product_name\}/g, productName)
    .replace(/\{brand_name\}/g, brandName || 'Brand')
    .replace(/\{company_name\}/g, brandName || 'Company');
  if (additionalContext) {
    prompt += `, ${additionalContext}`;
  }
  return prompt;
}

export default {
  TVC_TEMPLATES,
  BRAND_TEMPLATES,
  SOCIAL_TEMPLATES,
  HOLIDAY_TEMPLATES,
  getTemplatesByCategory,
  generateAdPrompt,
};
