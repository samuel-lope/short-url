import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { AppEnv } from '../types.ts';
import { SESSION_COOKIE_NAME } from '../middleware/auth.ts';
import { generateSessionToken, hashPassword, sha256Hex, verifyPassword } from '../services/crypto.ts';
import { resolveUserFeatures } from '../services/entitlements.ts';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres.').max(100),
  email: z.string().trim().email('E-mail inválido.').max(180),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres.').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email('E-mail inválido.'),
  password: z.string().min(1, 'Senha obrigatória.'),
});

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function setSessionCookie(c: Parameters<typeof setCookie>[0], rawToken: string, reqUrl: string) {
  const isHttps = reqUrl.startsWith('https://');
  setCookie(c, SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.get('/me', (c) => {
  return c.json({
    user: c.get('user'),
    features: c.get('features'),
  });
});

authRoutes.post('/register', async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, 400);
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return c.json({ error: 'E-mail já cadastrado.' }, 409);
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

  const inserted = await c.env.DB.prepare(
    `INSERT INTO users (email, password_hash, name, role, plan_id)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`
  )
    .bind(email, passwordHash, parsed.data.name, role, planId)
    .first<{ id: number }>();

  if (!inserted) {
    return c.json({ error: 'Falha ao criar usuário.' }, 500);
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

authRoutes.post('/login', async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Credenciais inválidas.' }, 400);
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
    return c.json({ error: 'E-mail ou senha incorretos.' }, 401);
  }

  if (row.is_active !== 1) {
    return c.json({ error: 'Conta desativada.' }, 403);
  }

  const rawToken = generateSessionToken();
  const tokenHash = await sha256Hex(rawToken);
  const sessionId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .bind(sessionId, row.id, tokenHash, expiresAt)
    .run();

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
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
  return c.json({ ok: true });
});
