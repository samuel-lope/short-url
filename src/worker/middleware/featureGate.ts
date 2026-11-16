import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.ts';
import { hasFeature } from '../services/entitlements.ts';

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) {
    return c.json({ error: 'Autenticação necessária.' }, 401);
  }
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Autenticação necessária.' }, 401);
  }
  const features = c.get('features');
  const isAdmin =
    user.role === 'admin' || user.plan.hasFullAccess || hasFeature(features, 'admin.profiles');
  if (!isAdmin) {
    return c.json({ error: 'Acesso restrito a administradores.' }, 403);
  }
  await next();
};

export function requireFeature(featureKey: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Autenticação necessária.' }, 401);
    }
    const features = c.get('features');
    if (!hasFeature(features, featureKey)) {
      return c.json(
        {
          error: `Funcionalidade '${featureKey}' não liberada para sua conta.`,
          code: 'FEATURE_LOCKED',
          feature: featureKey,
        },
        403
      );
    }
    await next();
  };
}
