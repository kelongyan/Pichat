import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className={`${styles.container} fade-in`}>
      <div className={styles.emptyIcon}>
        {icon}
      </div>
      <p className={styles.emptyTitle}>{title}</p>
      {subtitle && (
        <p className={styles.emptySubtitle}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
