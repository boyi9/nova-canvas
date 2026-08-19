// Nova启画 - 广告法合规检测模块

// 违禁词库（简化版，实际使用需完整数据库）
const FORBIDDEN_KEYWORDS = {
  // 绝对化用语
  absolute: ['最', '最佳', '最好', '最优', '最高', '最低', '最大', '最小', '第一', '唯一', '首选', '顶级', '极致', '绝对', '100%', '全网最低', '史上最强', '独一无二'],
  // 虚假宣传
  falseClaim: ['包治百病', '药到病除', '立竿见影', '一次见效', '永久', '祖传秘方', '国家认证', '央视推荐', '明星同款（无授权）'],
  // 限时促销虚假
  fakePromotion: ['仅限今日', '最后一天', '即将售罄', '限量抢购（无实际限量）'],
  // 医疗保健
  healthcare: ['治疗', '治愈', '疗效', '特效药', '处方药', '保健功能（未获批）'],
  // 权威性虚假
  falseAuthority: ['国家免检', '驰名商标（已禁用）', '质量免检', '政府指定'],
};

// 敏感词检测结果类型
export interface ComplianceCheckResult {
  isValid: boolean;
  violations: Array<{
    keyword: string;
    category: string;
    position: number;
    suggestion: string;
  }>;
  score: number; // 0-100合规分数
}

/**
 * 检测文本是否符合广告法规范
 */
export function checkAdCompliance(text: string): ComplianceCheckResult {
  const violations: ComplianceCheckResult['violations'] = [];

  Object.entries(FORBIDDEN_KEYWORDS).forEach(([category, keywords]) => {
    keywords.forEach((keyword) => {
      const regex = new RegExp(keyword, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        violations.push({
          keyword,
          category: getCategoryName(category),
          position: match.index,
          suggestion: getSuggestion(category, keyword),
        });
      }
    });
  });

  const score = Math.max(0, 100 - violations.length * 10);

  return {
    isValid: violations.length === 0,
    violations,
    score,
  };
}

/**
 * 获取分类名称
 */
function getCategoryName(category: string): string {
  const names: Record<string, string> = {
    absolute: '绝对化用语',
    falseClaim: '虚假宣传',
    fakePromotion: '虚假促销',
    healthcare: '医疗保健',
    falseAuthority: '虚假权威',
  };
  return names[category] || category;
}

/**
 * 获取修改建议
 */
function getSuggestion(category: string, keyword: string): string {
  const suggestions: Record<string, string> = {
    absolute: `建议改为相对表述，如"优质"、"热门"替代"${keyword}"`,
    falseClaim: `"${keyword}"涉及虚假宣传，建议删除或提供权威检测报告`,
    fakePromotion: `"${keyword}"需有实际依据，建议改为具体活动时间`,
    healthcare: `"${keyword}"涉及医疗表述，需提供相关资质证明`,
    falseAuthority: `"${keyword}"已禁用，建议删除`,
  };
  return suggestions[category] || `建议删除"${keyword}"`;
}

/**
 * 检测图片中的文字（需配合OCR）
 */
export function checkImageTextCompliance(ocrText: string): ComplianceCheckResult {
  return checkAdCompliance(ocrText);
}

export default {
  checkAdCompliance,
  checkImageTextCompliance,
};
