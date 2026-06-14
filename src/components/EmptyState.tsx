import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="landing fade-in">
      <div style={{ color: 'var(--text-muted)', fontSize: 48, marginBottom: 16 }}>
        {icon}
      </div>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 15 }}>{title}</p>
      {subtitle && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
