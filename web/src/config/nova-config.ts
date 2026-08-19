// Nova启画 - 平台配置
export const NOVA_CONFIG = {
  name: 'Nova启画',
  version: '1.0.0-beta.1',
  description: '一站式AI内容创作平台',

  // 场景模式
  scenes: {
    ecommerce: {
      id: 'ecommerce',
      name: '电商素材',
      icon: 'ShoppingCart',
      description: '主图/详情图/带货短视频批量生成',
      templates: ['主图生成', '详情页编排', '带货视频', '爆款复刻', '风格迁移'],
    },
    advertising: {
      id: 'advertising',
      name: '广告宣传片',
      icon: 'Video',
      description: 'TVC/品牌宣传片/营销视频创作',
      templates: ['TVC分镜', '品牌宣传片', '产品广告', '社媒短视频', '节日营销'],
    },
    drama: {
      id: 'drama',
      name: '轻情景剧/短剧',
      icon: 'Clapperboard',
      description: 'AI短剧/情景剧/漫剧创作',
      templates: ['剧本生图', '角色设计', '分镜生成', '多集编排', '配音配乐'],
    },
  },

  // AI模型配置
  models: {
    image: {
      primary: 'seedream-5.0',     // 即梦Seedream 5.0
      fallback: 'flux-schnell',     // 开源FLUX
      costPerImage: 0.3,            // 元/张
    },
    video: {
      primary: 'seedance-2.0',      // Seedance 2.0
      fallback: 'cogvideox',        // 开源CogVideoX
      costPerSecond: 0.5,           // 元/秒
    },
    text: {
      primary: 'deepseek-chat',     // DeepSeek
      costPerToken: 0.000001,       // 元/token
    },
  },

  // 会员等级
  plans: {
    free: {
      name: '免费版',
      price: 0,
      features: ['每日10张图片', '每日1条短视频', '基础模板'],
    },
    pro: {
      name: '专业版',
      price: 99,
      features: ['无限图片', '每月100条视频', '全部模板', '风格迁移', '优先生成'],
    },
    enterprise: {
      name: '企业版',
      price: 499,
      features: ['无限生成', 'API接入', '定制工作流', '专属客服', 'SLA保障'],
    },
  },

  // 合规配置
  compliance: {
    maxTextLength: 200,
    watermarkEnabled: true,
    watermarkText: 'AI生成内容',
    adLawCheckEnabled: true,
  },
};

export type SceneId = keyof typeof NOVA_CONFIG.scenes;
export type ModelType = 'image' | 'video' | 'text';
