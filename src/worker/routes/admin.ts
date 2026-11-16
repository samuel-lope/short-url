import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types.ts';
import { requireAdmin } from '../middleware/featureGate.ts';

const createFeatureSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9._-]{3,60}$/, 'Chave inválida (use letras minúsculas, números, ponto, - ou _).'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional().default(''),
  category: z.string().trim().min(2).max(40).optional().default('custom'),
  defaultEnabled: z.boolean().optional().default(false),
});

const createProfileSchema = z.object({
  name: z.string().trim().min(2, 'Nome do perfil deve ter ao menos 2 caracteres.').max(60),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{2,40}$/, 'Slug inválido (use letras minúsculas, números, - ou _).')
    .optional(),
  description: z.string().trim().max(240).optional().default(''),
  hasFullAccess: z.boolean().optional().default(false),
  featureKeys: z.array(z.string()).optional().default(['links.create', 'links.manage_own']),
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(240).optional(),
  hasFullAccess: z.boolean().optional(),
});

const overrideSchema = z.object({
  enabled: z.boolean().nullable(),
  limitValue: z.number().int().min(0).nullable().optional(),
  expiresAt: z.number().int().nullable().optional(),
});

const updateUserSchema = z.object({
  planId: z.number().int().positive().optional(),
  role: z.enum(['user', 'admin']).optional(),
  isActive: z.boolean().optional(),
});

const updatePlanFeatureSchema = z.object({
  enabled: z.boolean(),
  limitValue: z.number().int().min(0).nullable().optional(),
});

function toSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use('*', requireAdmin);

adminRoutes.get('/overview', async (c) => {
  const [plans, features, planFeatures, users, overrides] = await Promise.all([
    c.env.DB.prepare(
      'SELECT id, slug, name, description, is_system AS isSystem, has_full_access AS hasFullAccess FROM plans ORDER BY id ASC'
    ).all(),
    c.env.DB.prepare(
      'SELECT key, name, description, category, default_enabled AS defaultEnabled FROM features ORDER BY category, key'
    ).all(),
    c.env.DB.prepare(
      'SELECT plan_id AS planId, feature_key AS featureKey, enabled, limit_value AS limitValue FROM plan_features'
    ).all(),
    c.env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.role, u.plan_id AS planId, p.name AS planName, u.is_active AS isActive, u.created_at AS createdAt
       FROM users u JOIN plans p ON p.id = u.plan_id ORDER BY u.id ASC`
    ).all(),
    c.env.DB.prepare(
      'SELECT user_id AS userId, feature_key AS featureKey, enabled, limit_value AS limitValue, expires_at AS expiresAt FROM user_feature_overrides'
    ).all(),
  ]);

  return c.json({
    plans: plans.results.map((p) => ({
      ...p,
      isSystem: p.isSystem === 1,
      hasFullAccess: p.hasFullAccess === 1,
    })),
    features: features.results.map((f) => ({ ...f, defaultEnabled: f.defaultEnabled === 1 })),
    planFeatures: planFeatures.results.map((pf) => ({ ...pf, enabled: pf.enabled === 1 })),
    users: users.results.map((u) => ({ ...u, isActive: u.isActive === 1 })),
    overrides: overrides.results.map((o) => ({ ...o, enabled: o.enabled === 1 })),
  });
});

adminRoutes.post('/profiles', async (c) => {
  const parsed = createProfileSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, 400);
  }

  const slug = parsed.data.slug || toSlug(parsed.data.name);
  if (slug.length < 2) {
    return c.json({ error: 'Slug inválido para o perfil.' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM plans WHERE slug = ? OR name = ?')
    .bind(slug, parsed.data.name)
    .first();
  if (existing) {
    return c.json({ error: 'Já existe um perfil com este nome ou slug.' }, 409);
  }

  const inserted = await c.env.DB.prepare(
    `INSERT INTO plans (slug, name, description, is_system, has_full_access)
     VALUES (?, ?, ?, 0, ?)
     RETURNING id`
  )
    .bind(slug, parsed.data.name, parsed.data.description, parsed.data.hasFullAccess ? 1 : 0)
    .first<{ id: number }>();

  if (!inserted) {
    return c.json({ error: 'Falha ao criar perfil de acesso.' }, 500);
  }

  const { results: allFeatures } = await c.env.DB.prepare('SELECT key FROM features').all<{ key: string }>();
  const enabledSet = new Set(parsed.data.featureKeys);
  const statements = allFeatures.map((f) =>
    c.env.DB.prepare(
      'INSERT INTO plan_features (plan_id, feature_key, enabled, limit_value) VALUES (?, ?, ?, NULL)'
    ).bind(inserted.id, f.key, parsed.data.hasFullAccess || enabledSet.has(f.key) ? 1 : 0)
  );
  if (statements.length > 0) {
    await c.env.DB.batch(statements);
  }

  return c.json({ id: inserted.id, slug, name: parsed.data.name }, 201);
});

adminRoutes.patch('/profiles/:profileId', async (c) => {
  const profileId = Number(c.req.param('profileId'));
  if (!Number.isInteger(profileId)) return c.json({ error: 'Perfil inválido.' }, 400);

  const existing = await c.env.DB.prepare(
    'SELECT id, slug, name, description, is_system, has_full_access FROM plans WHERE id = ?'
  )
    .bind(profileId)
    .first<{
      id: number;
      slug: string;
      name: string;
      description: string | null;
      is_system: number;
      has_full_access: number;
    }>();
  if (!existing) return c.json({ error: 'Perfil não encontrado.' }, 404);

  const parsed = updateProfileSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Dados inválidos.' }, 400);

  if (existing.slug === 'admin' && parsed.data.hasFullAccess === false) {
    return c.json({ error: 'O perfil Admin deve manter acesso total.' }, 400);
  }

  await c.env.DB.prepare('UPDATE plans SET name = ?, description = ?, has_full_access = ? WHERE id = ?')
    .bind(
      parsed.data.name ?? existing.name,
      parsed.data.description ?? existing.description,
      parsed.data.hasFullAccess !== undefined ? (parsed.data.hasFullAccess ? 1 : 0) : existing.has_full_access,
      profileId
    )
    .run();

  return c.json({ ok: true });
});

adminRoutes.delete('/profiles/:profileId', async (c) => {
  const profileId = Number(c.req.param('profileId'));
  if (!Number.isInteger(profileId)) return c.json({ error: 'Perfil inválido.' }, 400);

  const profile = await c.env.DB.prepare('SELECT id, is_system FROM plans WHERE id = ?')
    .bind(profileId)
    .first<{ id: number; is_system: number }>();
  if (!profile) return c.json({ error: 'Perfil não encontrado.' }, 404);
  if (profile.is_system === 1) {
    return c.json({ error: 'Perfis pré-definidos do sistema não podem ser removidos.' }, 400);
  }

  const registered = await c.env.DB.prepare("SELECT id FROM plans WHERE slug = 'registered'").first<{ id: number }>();
  const fallbackId = registered?.id ?? 1;
  await c.env.DB.prepare('UPDATE users SET plan_id = ? WHERE plan_id = ?').bind(fallbackId, profileId).run();
  await c.env.DB.prepare('DELETE FROM plans WHERE id = ?').bind(profileId).run();

  return c.json({ ok: true });
});

adminRoutes.post('/features', async (c) => {
  const parsed = createFeatureSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT key FROM features WHERE key = ?')
    .bind(parsed.data.key)
    .first();
  if (existing) return c.json({ error: 'Feature já cadastrada.' }, 409);

  await c.env.DB.prepare(
    'INSERT INTO features (key, name, description, category, default_enabled) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(
      parsed.data.key,
      parsed.data.name,
      parsed.data.description,
      parsed.data.category,
      parsed.data.defaultEnabled ? 1 : 0
    )
    .run();

  return c.json({ ok: true, key: parsed.data.key }, 201);
});

adminRoutes.patch('/plans/:planId/features/:featureKey', async (c) => {
  const planId = Number(c.req.param('planId'));
  const featureKey = c.req.param('featureKey');
  if (!Number.isInteger(planId)) return c.json({ error: 'Perfil inválido.' }, 400);

  const profile = await c.env.DB.prepare('SELECT id, has_full_access FROM plans WHERE id = ?')
    .bind(planId)
    .first<{ id: number; has_full_access: number }>();
  if (!profile) return c.json({ error: 'Perfil não encontrado.' }, 404);
  if (profile.has_full_access === 1) {
    return c.json({ error: 'Perfis com acesso total já possuem todas as funcionalidades habilitadas.' }, 400);
  }

  const parsed = updatePlanFeatureSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Dados inválidos.' }, 400);

  await c.env.DB.prepare(
    `INSERT INTO plan_features (plan_id, feature_key, enabled, limit_value)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(plan_id, feature_key) DO UPDATE SET enabled = excluded.enabled, limit_value = excluded.limit_value`
  )
    .bind(planId, featureKey, parsed.data.enabled ? 1 : 0, parsed.data.limitValue ?? null)
    .run();

  return c.json({ ok: true });
});

adminRoutes.patch('/users/:userId', async (c) => {
  const userId = Number(c.req.param('userId'));
  if (!Number.isInteger(userId)) return c.json({ error: 'Usuário inválido.' }, 400);

  const existing = await c.env.DB.prepare('SELECT id, plan_id, role, is_active FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: number; plan_id: number; role: string; is_active: number }>();
  if (!existing) return c.json({ error: 'Usuário não encontrado.' }, 404);

  const parsed = updateUserSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Dados inválidos.' }, 400);

  let nextRole = parsed.data.role ?? existing.role;
  if (parsed.data.planId !== undefined) {
    const targetProfile = await c.env.DB.prepare('SELECT id, slug, has_full_access FROM plans WHERE id = ?')
      .bind(parsed.data.planId)
      .first<{ id: number; slug: string; has_full_access: number }>();
    if (!targetProfile) return c.json({ error: 'Perfil de acesso não encontrado.' }, 404);
    if (targetProfile.slug === 'anonymous') {
      return c.json({ error: 'O perfil Anônimo é exclusivo para visitantes não autenticados.' }, 400);
    }
    if (parsed.data.role === undefined) {
      nextRole = targetProfile.has_full_access === 1 || targetProfile.slug === 'admin' ? 'admin' : 'user';
    }
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare('UPDATE users SET plan_id = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ?')
    .bind(
      parsed.data.planId ?? existing.plan_id,
      nextRole,
      parsed.data.isActive !== undefined ? (parsed.data.isActive ? 1 : 0) : existing.is_active,
      now,
      userId
    )
    .run();

  return c.json({ ok: true });
});

adminRoutes.put('/users/:userId/features/:featureKey', async (c) => {
  const userId = Number(c.req.param('userId'));
  const featureKey = c.req.param('featureKey');
  if (!Number.isInteger(userId)) return c.json({ error: 'Usuário inválido.' }, 400);

  const parsed = overrideSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Dados inválidos.' }, 400);

  if (parsed.data.enabled === null) {
    await c.env.DB.prepare('DELETE FROM user_feature_overrides WHERE user_id = ? AND feature_key = ?')
      .bind(userId, featureKey)
      .run();
    return c.json({ ok: true, removed: true });
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `INSERT INTO user_feature_overrides (user_id, feature_key, enabled, limit_value, expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, feature_key)
     DO UPDATE SET enabled = excluded.enabled, limit_value = excluded.limit_value, expires_at = excluded.expires_at, updated_at = excluded.updated_at`
  )
    .bind(
      userId,
      featureKey,
      parsed.data.enabled ? 1 : 0,
      parsed.data.limitValue ?? null,
      parsed.data.expiresAt ?? null,
      now
    )
    .run();

  return c.json({ ok: true });
});
