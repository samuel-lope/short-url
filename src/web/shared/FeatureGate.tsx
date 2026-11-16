import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../app/AuthContext.tsx';

export function LockedFeatureNotice({
  feature,
  title = 'Recurso bloqueado no seu plano',
  description,
}: {
  feature: string;
  title?: string;
  description?: string;
}) {
  return (
    <div className="y2k-card-sm y2k-card-yellow" role="region" aria-label={title}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 900 }}>
        <Lock size={18} aria-hidden="true" />
        <span>{title}</span>
      </div>
      <p style={{ margin: '0.45rem 0 0', fontSize: '0.9rem' }}>
        {description ?? `A funcionalidade "${feature}" ainda não está habilitada para sua conta.`}
      </p>
    </div>
  );
}

export function FeatureGate({
  feature,
  children,
  fallback,
}: {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { hasFeature } = useAuth();
  if (!hasFeature(feature)) {
    return <>{fallback ?? null}</>;
  }
  return <>{children}</>;
}
