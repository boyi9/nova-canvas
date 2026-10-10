// Nova启画 - Campaign Style Lock：多图风格一致性约束系统
// 参考：ecom-details-image Campaign Style Lock 机制

import type { EcommerceTemplate } from "@/templates/ecommerce/main-image-templates";

export interface StyleLockConfig {
  colorPalette: string[];       // 锁定的配色方案 (hex)
  lightingStyle: string;        // 灯光风格标识
  composition: string;          // 构图规则标识
  backgroundType: string;       // 背景类型标识
  negativePrompt?: string;      // 统一负面提示词
  seed?: number;                // 可选：固定种子
  guidanceScale?: number;       // 可选：固定引导系数
}

export interface StyleLockContext {
  // 当前锁定的风格配置
  activeLock: StyleLockConfig | null;
  // 源模板ID（用于追溯）
  sourceTemplateId: string | null;
  // 已生成的图片引用（用于@reference）
  generatedReferences: StyleReference[];
  // 是否启用
  enabled: boolean;
}

export interface StyleReference {
  id: string;           // 引用ID
  url: string;          // 图片URL
  nodeId: string;       // 来源节点ID
  templateId: string;   // 使用的模板ID
  prompt: string;       // 生成时的完整prompt
  timestamp: number;
}

/**
 * 从模板提取Style Lock配置
 */
export function extractStyleLock(template: EcommerceTemplate): StyleLockConfig | null {
  if (!template.styleLock) return null;
  
  return {
    colorPalette: template.styleLock.colorPalette,
    lightingStyle: template.styleLock.lightingStyle,
    composition: template.styleLock.composition,
    backgroundType: template.styleLock.backgroundType,
  };
}

/**
 * 将Style Lock注入到prompt中
 */
export function injectStyleLock(prompt: string, lock: StyleLockConfig): string {
  const parts: string[] = [prompt];
  
  if (lock.colorPalette.length > 0) {
    parts.push(`color palette: ${lock.colorPalette.join(', ')}`);
  }
  if (lock.lightingStyle) {
    parts.push(`lighting: ${lock.lightingStyle}`);
  }
  if (lock.composition) {
    parts.push(`composition: ${lock.composition}`);
  }
  if (lock.backgroundType) {
    parts.push(`background: ${lock.backgroundType}`);
  }
  if (lock.negativePrompt) {
    parts.push(`negative: ${lock.negativePrompt}`);
  }
  
  return parts.join(', ');
}

/**
 * 创建带Style Lock的生成参数
 */
export function createStyleLockedParams(
  baseParams: Record<string, any>,
  lock: StyleLockConfig
): Record<string, any> {
  return {
    ...baseParams,
    // 注入到prompt
    prompt: injectStyleLock(baseParams.prompt || '', lock),
    // 固定技术参数
    ...(lock.seed !== undefined && { seed: lock.seed }),
    ...(lock.guidanceScale !== undefined && { guidance_scale: lock.guidanceScale }),
    // 传递锁配置供后端使用
    style_lock: lock,
  };
}

/**
 * Style Lock状态管理（可用于Zustand store）
 */
export const DEFAULT_STYLE_LOCK_CONTEXT: StyleLockContext = {
  activeLock: null,
  sourceTemplateId: null,
  generatedReferences: [],
  enabled: false,
};

/**
 * 检查两个Style Lock是否兼容（用于批量生成前验证）
 */
export function areStyleLocksCompatible(lock1: StyleLockConfig, lock2: StyleLockConfig): boolean {
  // 核心视觉要素必须一致
  return (
    JSON.stringify(lock1.colorPalette) === JSON.stringify(lock2.colorPalette) &&
    lock1.lightingStyle === lock2.lightingStyle &&
    lock1.composition === lock2.composition &&
    lock1.backgroundType === lock2.backgroundType
  );
}

/**
 * 从已生成图片推导Style Lock（反向工程）
 * 用于：用户上传参考图 -> 分析 -> 生成Lock
 */
export function inferStyleLockFromReferences(
  references: StyleReference[]
): StyleLockConfig | null {
  if (references.length === 0) return null;
  
  // 简化版：取第一张作为基准
  // 实际应用中可调用视觉分析API
  const first = references[0];
  
  return {
    colorPalette: ['#FFFFFF', '#F5F5F5', '#E8E8E8', '#333333'], // 默认
    lightingStyle: 'studio-softbox',
    composition: 'rule-of-thirds',
    backgroundType: 'clean-gradient',
  };
}

/**
 * 常用Style Lock预设
 */
export const STYLE_LOCK_PRESETS: Record<string, StyleLockConfig> = {
  'ecommerce-clean': {
    colorPalette: ['#FFFFFF', '#F5F5F5', '#E8E8E8', '#333333'],
    lightingStyle: 'studio-softbox',
    composition: 'rule-of-thirds',
    backgroundType: 'clean-white',
  },
  'ecommerce-lifestyle': {
    colorPalette: ['#FDF8F3', '#F5E6D3', '#E8D5B7', '#8B7355'],
    lightingStyle: 'natural-window',
    composition: 'rule-of-thirds',
    backgroundType: 'lifestyle-room',
  },
  'ecommerce-luxury': {
    colorPalette: ['#1A1A1A', '#D4AF37', '#F5F5F5', '#2D2D2D'],
    lightingStyle: 'dramatic-rim',
    composition: 'centered',
    backgroundType: 'marble-texture',
  },
  'ecommerce-tech': {
    colorPalette: ['#0A0A0A', '#00FFFF', '#FFFFFF', '#1A1A2E'],
    lightingStyle: 'neon-rim',
    composition: 'floating-center',
    backgroundType: 'dark-gradient',
  },
  'social-aesthetic': {
    colorPalette: ['#FFF5F5', '#FFE4E1', '#F0E6FF', '#E6F3FF'],
    lightingStyle: 'soft-natural',
    composition: 'flatlay-aesthetic',
    backgroundType: 'textured-fabric',
  },
};

export default {
  extractStyleLock,
  injectStyleLock,
  createStyleLockedParams,
  areStyleLocksCompatible,
  inferStyleLockFromReferences,
  STYLE_LOCK_PRESETS,
  DEFAULT_STYLE_LOCK_CONTEXT,
};