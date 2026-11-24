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
      <Icon size={18} aria-hidden="true" className="alert-icon" />
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
      {actions && <div className="cluster">{actions}</div>}
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
      <strong className="empty-state-title">{title}</strong>
      {description && <span className="empty-state-desc">{description}</span>}
      {action}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Carregando conteúdo" className="skeleton-stack">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={i === 0 ? 'skeleton-block skeleton-block--short' : 'skeleton-block'} />
      ))}
    </div>
  );
}
