import { Hono, type Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { loginSchema, registerSchema } from '../../shared/contracts.ts';
import type { AppEnv } from '../types.ts';
import { SESSION_COOKIE_NAME } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import { generateSessionToken, hashPassword, sha256Hex, verifyPassword } from '../services/crypto.ts';
import { resolveAnonymousFeatures, resolveUserFeatures } from '../services/entitlements.ts';
import { apiError, runInBackground } from '../services/runtime.ts';
import { isUniqueConstraintError } from '../services/validation.ts';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function setSessionCookie(c: Context<AppEnv>, rawToken: string, reqUrl: string) {
  const isHttps = reqUrl.startsWith('https://');
  setCookie(c, SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

function scheduleExpiredSessionCleanup(db: D1Database, c: Context<AppEnv>) {
  const now = Math.floor(Date.now() / 1000);
  const cleanup = db
    .prepare('DELETE FROM sessions WHERE expires_at <= ?')
    .bind(now)
    .run()
    .catch(() => {});
  void runInBackground(c, cleanup);
}

export const authRoutes = new Hono<AppEnv>();

const authRateLimit = rateLimit({ scope: 'auth', maxRequests: 10, windowSeconds: 60 });

authRoutes.get('/me', (c) => {
  return c.json({
    user: c.get('user'),
    features: c.get('features'),
  });
});

authRoutes.post('/register', authRateLimit, async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(c, 400, parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return apiError(c, 409, 'E-mail já cadastrado.');
  }

  const countRow = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM users').first<{ total: number }>();
  const isFirstUser = (countRow?.total ?? 0) === 0;
  const targetSlug = isFirstUser ? 'admin' : 'registered';
  const profileRow = await c.env.DB.prepare(
    'SELECT id, slug, name, has_full_access FROM plans WHERE slug = ?'
  )
    .bind(targetSlug)
    .first<{ id: number; slug: string; name: string; has_full_access: number }>();

  const role: 'admin' | 'user' = isFirstUser ? 'admin' : 'user';
  const planId = profileRow?.id ?? (isFirstUser ? 3 : 1);

  const passwordHash = await hashPassword(parsed.data.password);

  let inserted: { id: number } | null = null;
  try {
    inserted = await c.env.DB.prepare(
      `INSERT INTO users (email, password_hash, name, role, plan_id)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id`
    )
      .bind(email, passwordHash, parsed.data.name, role, planId)
      .first<{ id: number }>();
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return apiError(c, 409, 'E-mail já cadastrado.');
    }
    throw err;
  }

  if (!inserted) {
    return apiError(c, 500, 'Falha ao criar usuário.');
  }

  const rawToken = generateSessionToken();
  const tokenHash = await sha256Hex(rawToken);
  const sessionId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .bind(sessionId, inserted.id, tokenHash, expiresAt)
    .run();

  const features = await resolveUserFeatures(c.env.DB, inserted.id, planId);
  setSessionCookie(c, rawToken, c.req.url);

  return c.json(
    {
      user: {
        id: inserted.id,
        email,
        name: parsed.data.name,
        role,
        plan: {
          id: planId,
          slug: profileRow?.slug ?? targetSlug,
          name: profileRow?.name ?? (isFirstUser ? 'Admin' : 'Usuário Registrado'),
          hasFullAccess: profileRow?.has_full_access === 1 || isFirstUser,
        },
      },
      features,
    },
    201
  );
});

authRoutes.post('/login', authRateLimit, async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(c, 400, parsed.error.issues[0]?.message ?? 'Credenciais inválidas.');
  }

  const email = parsed.data.email.toLowerCase();
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.password_hash, u.name, u.role, u.is_active,
            p.id AS plan_id, p.slug AS plan_slug, p.name AS plan_name, p.has_full_access AS has_full_access
     FROM users u
     JOIN plans p ON p.id = u.plan_id
     WHERE u.email = ?`
  )
    .bind(email)
    .first<{
      id: number;
      email: string;
      password_hash: string;
      name: string;
      role: 'user' | 'admin';
      is_active: number;
      plan_id: number;
      plan_slug: string;
      plan_name: string;
      has_full_access: number;
    }>();

  if (!row || !(await verifyPassword(parsed.data.password, row.password_hash))) {
    return apiError(c, 401, 'E-mail ou senha incorretos.');
  }

  if (row.is_active !== 1) {
    return apiError(c, 403, 'Conta desativada.');
  }

  const rawToken = generateSessionToken();
  const tokenHash = await sha256Hex(rawToken);
  const sessionId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .bind(sessionId, row.id, tokenHash, expiresAt)
    .run();

  scheduleExpiredSessionCleanup(c.env.DB, c);

  const features = await resolveUserFeatures(c.env.DB, row.id, row.plan_id);
  setSessionCookie(c, rawToken, c.req.url);

  return c.json({
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      plan: {
        id: row.plan_id,
        slug: row.plan_slug,
        name: row.plan_name,
        hasFullAccess: row.has_full_access === 1,
      },
    },
    features,
  });
});

authRoutes.post('/logout', async (c) => {
  const sessionId = c.get('sessionId');
  if (sessionId) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  }
  scheduleExpiredSessionCleanup(c.env.DB, c);
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
  const features = await resolveAnonymousFeatures(c.env.DB);
  return c.json({ ok: true, features });
});
