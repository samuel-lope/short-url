import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning';
  children: ReactNode;
}) {
  const toneClass = tone === 'neutral' ? '' : `badge--${tone}`;
  return <span className={`badge ${toneClass}`.trim()}>{children}</span>;
}

export function Alert({
  tone = 'info',
  role,
  children,
}: {
  tone?: 'error' | 'info' | 'success' | 'warning';
  role?: 'alert' | 'status';
  children: ReactNode;
}) {
  const Icon =
    tone === 'error'
      ? AlertCircle
      : tone === 'success'
        ? CheckCircle2
        : tone === 'warning'
          ? AlertTriangle
          : Info;

  return (
    <div className={`alert alert--${tone}`} role={role ?? (tone === 'error' ? 'alert' : 'status')}>
      <Icon size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
      <div>{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon}
      <strong style={{ color: 'var(--text)' }}>{title}</strong>
      {description && <span style={{ fontSize: '0.9rem', maxWidth: '42ch' }}>{description}</span>}
      {action}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Carregando conteúdo" style={{ display: 'grid', gap: '0.75rem' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-block" style={{ width: i === 0 ? '55%' : '100%' }} />
      ))}
    </div>
  );
}
