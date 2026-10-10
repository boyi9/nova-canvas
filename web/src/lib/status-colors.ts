/**
 * 状态色板 —— 统一语义状态的取值来源。
 *
 * 背景：这些颜色此前散落在各组件的内联 style 里（硬编码 hex），
 * 既无法随主题切换，也无法集中调整对比度。这里统一引用 tokens.css
 * 中的 CSS 变量，使状态色可主题化并保持暗色模式一致。
 */

const cssVar = (name: string) => `var(${name})`;

/** 与 tokens.css 中的 --color-* 令牌对应。 */
export const STATUS_COLORS = {
  success: cssVar("--color-success"),
  warning: cssVar("--color-warning"),
  error: cssVar("--color-error"),
  info: cssVar("--color-info"),
  brand: cssVar("--color-brand-primary"),
  ai: cssVar("--color-ai-secondary"),
  muted: cssVar("--color-gray-500"),
} as const;

export type StatusColorKey = keyof typeof STATUS_COLORS;

/** 按角色取消息气泡强调色。 */
export function roleColor(role: string, fallback: string): string {
  if (role === "error") return STATUS_COLORS.error;
  if (role === "tool") return STATUS_COLORS.info;
  return fallback;
}

/** 按执行状态取状态色。 */
export function runStatusColor(opts: { running?: boolean; failed?: boolean; success?: boolean }): string {
  if (opts.failed) return STATUS_COLORS.error;
  if (opts.running) return STATUS_COLORS.warning;
  if (opts.success) return STATUS_COLORS.success;
  return STATUS_COLORS.muted;
}