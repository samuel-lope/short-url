import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../app/AuthContext.tsx';
import { Badge, Tile } from './ui/index.ts';

export function LockedFeatureNotice({
  feature,
  title = 'Recurso bloqueado no seu perfil',
  description,
}: {
  feature: string;
  title?: string;
  description?: string;
}) {
  return (
    <Tile c={4} variant="warning" as="div" aria-label={title}>
      <div className="cluster-between">
        <div className="notice-title">
          <Lock size={17} aria-hidden="true" />
          <span>{title}</span>
        </div>
        <Badge tone="warning">{feature}</Badge>
      </div>
      <p className="text-muted m-0 meta-text">
        {description ?? `A funcionalidade "${feature}" ainda não está habilitada para sua conta.`}
      </p>
    </Tile>
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
