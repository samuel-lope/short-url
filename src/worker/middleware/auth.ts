import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '../types.ts';
import { sha256Hex } from '../services/crypto.ts';
import { resolveAnonymousFeatures, resolveUserFeatures } from '../services/entitlements.ts';

export const SESSION_COOKIE_NAME = 'sa_session';

interface SessionUserRow {
  session_id: string;
  user_id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  is_active: number;
  plan_id: number;
  plan_slug: string;
  plan_name: string;
  has_full_access: number;
}

export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null);
  c.set('features', {});
  c.set('sessionId', null);

  const authHeader = c.req.header('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const cookieToken = getCookie(c, SESSION_COOKIE_NAME);
  const rawToken = bearerToken || cookieToken;

  if (rawToken && c.env.DB) {
    const tokenHash = await sha256Hex(rawToken);
    const now = Math.floor(Date.now() / 1000);

    const row = await c.env.DB.prepare(
      `SELECT
        s.id AS session_id,
        u.id AS user_id,
        u.email AS email,
        u.name AS name,
        u.role AS role,
        u.is_active AS is_active,
        p.id AS plan_id,
        p.slug AS plan_slug,
        p.name AS plan_name,
        p.has_full_access AS has_full_access
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      JOIN plans p ON p.id = u.plan_id
      WHERE s.token_hash = ? AND s.expires_at > ?`
    )
      .bind(tokenHash, now)
      .first<SessionUserRow>();

    if (row && row.is_active === 1) {
      const features = await resolveUserFeatures(c.env.DB, row.user_id, row.plan_id);
      c.set('sessionId', row.session_id);
      c.set('user', {
        id: row.user_id,
        email: row.email,
        name: row.name,
        role: row.role,
        plan: {
          id: row.plan_id,
          slug: row.plan_slug,
          name: row.plan_name,
          hasFullAccess: row.has_full_access === 1,
        },
      });
      c.set('features', features);
      await next();
      return;
    }
  }

  if (c.env.DB) {
    c.set('features', await resolveAnonymousFeatures(c.env.DB));
  }

  await next();
};
