import { type FC, useEffect, useState } from 'react';
import { Loader2, CheckCircle, XCircle, AlertCircle, Clock, RotateCcw, AlertTriangle } from 'lucide-react';
import styles from './TaskStatus.module.css';

export type TaskStatusType = 'queued' | 'running' | 'success' | 'error' | 'needs_review' | 'cancelled';

export interface TaskStatusProps {
  status: TaskStatusType;
  progress?: number; // 0-100 for running status
  message?: string;
  onRetry?: () => void;
  onCancel?: () => void;
  showActions?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const STATUS_CONFIG: Record<TaskStatusType, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  queued: {
    label: '排队中',
    icon: <Clock className="size-4" />,
    color: 'var(--color-gray-500)',
    bgColor: 'var(--color-gray-100)'
  },
  running: {
    label: '生成中',
    icon: <Loader2 className="size-4 animate-spin" />,
    color: 'var(--color-brand-primary)',
    bgColor: 'var(--color-brand-primary-light)'
  },
  success: {
    label: '完成',
    icon: <CheckCircle className="size-4" />,
    color: 'var(--color-success)',
    bgColor: 'var(--color-success-light)'
  },
  error: {
    label: '失败',
    icon: <XCircle className="size-4" />,
    color: 'var(--color-error)',
    bgColor: 'var(--color-error-light)'
  },
  needs_review: {
    label: '需人工确认',
    icon: <AlertTriangle className="size-4" />,
    color: 'var(--color-warning)',
    bgColor: 'var(--color-warning-light)'
  },
  cancelled: {
    label: '已取消',
    icon: <RotateCcw className="size-4" />,
    color: 'var(--color-gray-500)',
    bgColor: 'var(--color-gray-100)'
  }
};

export const TaskStatus: FC<TaskStatusProps> = ({
  status,
  progress,
  message,
  onRetry,
  onCancel,
  showActions = true,
  size = 'md',
  className = ''
}) => {
  const config = STATUS_CONFIG[status];
  const [displayProgress, setDisplayProgress] = useState(progress ?? 0);

  useEffect(() => {
    if (progress !== undefined) {
      setDisplayProgress(progress);
    }
  }, [progress]);

  const statusClass = [styles.status, styles[size], className].filter(Boolean).join(' ');

  return (
    <div
      className={statusClass}
      style={{
        '--status-color': config.color,
        '--status-bg': config.bgColor
      } as React.CSSProperties}
      role="status"
      aria-live="polite"
    >
      <span className={styles.icon} aria-hidden="true">{config.icon}</span>

      <div className={styles.content}>
        <span className={styles.label}>{config.label}</span>
        {progress !== undefined && status === 'running' && (
          <div className={styles.progressContainer}>
            <div
              className={styles.progressBar}
              role="progressbar"
              aria-valuenow={displayProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={styles.progressFill}
                style={{ width: `${displayProgress}%` }}
              />
            </div>
            <span className={styles.progressText}>{displayProgress}%</span>
          </div>
        )}
        {message && <span className={styles.message}>{message}</span>}
      </div>

      {showActions && (
        <div className={styles.actions}>
          {status === 'running' && onCancel && (
            <button
              className={styles.actionButton}
              onClick={onCancel}
              aria-label="取消任务"
            >
              <XCircle className="size-4" />
            </button>
          )}
          {status === 'error' && onRetry && (
            <button
              className={styles.actionButton}
              onClick={onRetry}
              aria-label="重试任务"
            >
              <RotateCcw className="size-4" />
            </button>
          )}
          {status === 'needs_review' && onRetry && (
            <button
              className={styles.actionButton}
              onClick={onRetry}
              aria-label="处理任务"
            >
              <AlertCircle className="size-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export interface TaskStatusListProps {
  tasks: Array<{
    id: string;
    name: string;
    status: TaskStatusType;
    progress?: number;
    message?: string;
    onRetry?: () => void;
    onCancel?: () => void;
  }>;
  className?: string;
}

export const TaskStatusList: FC<TaskStatusListProps> = ({ tasks, className = '' }) => {
  return (
    <div className={[styles.list, className].filter(Boolean).join(' ')}>
      {tasks.map((task) => (
        <div key={task.id} className={styles.listItem}>
          <div className={styles.listItemInfo}>
            <span className={styles.listItemName}>{task.name}</span>
            {task.message && <span className={styles.listItemMessage}>{task.message}</span>}
          </div>
          <TaskStatus
            status={task.status}
            progress={task.progress}
            onRetry={task.onRetry}
            onCancel={task.onCancel}
            size="sm"
            showActions
          />
        </div>
      ))}
    </div>
  );
};

export default TaskStatus;