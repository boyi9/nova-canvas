import { type FC } from 'react';
import { Sparkles, Zap, Search, CheckCircle, AlertCircle } from 'lucide-react';
import styles from './AiBadge.module.css';

export type AiCapabilityLevel = 'prefill' | 'suggest' | 'generate' | 'review';

export interface AiBadgeProps {
  level: AiCapabilityLevel;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  tooltip?: string;
}

const LEVEL_CONFIG: Record<AiCapabilityLevel, { label: string; icon: React.ReactNode; color: string; description: string }> = {
  prefill: {
    label: 'AI 预填',
    icon: <Zap className="size-3" />,
    color: 'var(--color-info)',
    description: '基于上下文自动填充字段，需用户确认'
  },
  suggest: {
    label: 'AI 建议',
    icon: <Sparkles className="size-3" />,
    color: 'var(--color-brand-primary)',
    description: '提供建议方案，用户可一键采用或忽略'
  },
  generate: {
    label: 'AI 生成',
    icon: <Zap className="size-3" />,
    color: 'var(--color-warning)',
    description: '直接生成最终结果（图片/视频/文案）'
  },
  review: {
    label: 'AI 审片',
    icon: <CheckCircle className="size-3" />,
    color: 'var(--color-success)',
    description: '自动审核合规/质量，给出修改建议'
  }
};

export const AiBadge: FC<AiBadgeProps> = ({
  level,
  size = 'md',
  className = '',
  tooltip
}) => {
  const config = LEVEL_CONFIG[level];
  const badgeClass = [styles.badge, styles[size], className].filter(Boolean).join(' ');

  return (
    <span
      className={badgeClass}
      style={{ '--badge-color': config.color } as React.CSSProperties}
      title={tooltip || config.description}
    >
      <span className={styles.icon} aria-hidden="true">{config.icon}</span>
      <span className={styles.label}>{config.label}</span>
    </span>
  );
};

export const AiBadgeGroup: FC<{ capabilities: AiCapabilityLevel[]; className?: string }> = ({
  capabilities,
  className = ''
}) => {
  return (
    <div className={[styles.group, className].filter(Boolean).join(' ')}>
      {capabilities.map((level) => (
        <AiBadge key={level} level={level} size="sm" />
      ))}
    </div>
  );
};

export default AiBadge;