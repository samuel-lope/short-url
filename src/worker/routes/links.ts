import { Hono } from 'hono';
import { z } from 'zod';
import { RULE_TYPES, ruleConfigSchema } from '../../shared/contracts.ts';
import type { AppEnv } from '../types.ts';
import { requireAuth, requireFeature } from '../middleware/featureGate.ts';
import { getFeatureLimit, hasFeature } from '../services/entitlements.ts';
import { encodeId } from '../services/hashids.ts';
import { validateCustomSlug, validateHttpUrl } from '../services/validation.ts';

const createLinkSchema = z.object({
  url: z.string().min(1, 'URL é obrigatória.'),
  title: z.string().trim().max(120).optional().nullable(),
  customSlug: z.string().trim().optional().nullable(),
  mode: z.enum(['static', 'dynamic']).optional().default('static'),
});

const updateLinkSchema = z.object({
  title: z.string().trim().max(120).optional().nullable(),
  url: z.string().optional(),
  mode: z.enum(['static', 'dynamic']).optional(),
  isActive: z.boolean().optional(),
});

const createTargetSchema = z.object({
  label: z.string().trim().min(1, 'Nome do destino é obrigatório.').max(80),
  targetUrl: z.string().min(1, 'URL de destino é obrigatória.'),
  ruleType: z.enum(RULE_TYPES).optional().default('manual'),
  ruleConfig: ruleConfigSchema,
  priority: z.number().int().min(0).max(999).optional().default(0),
  isActive: z.boolean().optional().default(true),
  setAsActive: z.boolean().optional().default(false),
});

const updateTargetSchema = createTargetSchema.partial();

export async function createShortLink(params: {
  db: D1Database;
  hashSecret: string;
  origin: string;
  userId: number | null;
  url: string;
  title?: string | null;
  customSlug?: string | null;
  mode?: 'static' | 'dynamic';
}) {
  const urlCheck = validateHttpUrl(params.url);
  if (!urlCheck.valid) {
    return { status: 400 as const, body: { error: urlCheck.error } };
  }

  let finalCode: string | null = null;
  if (params.customSlug) {
    const slugCheck = validateCustomSlug(params.customSlug);
    if (!slugCheck.valid) {
      return { status: 400 as const, body: { error: slugCheck.error } };
    }
    const existingSlug = await params.db
      .prepare('SELECT id FROM links WHERE shortURL = ?')
      .bind(slugCheck.slug)
      .first();
    if (existingSlug) {
      return { status: 409 as const, body: { error: 'Este slug personalizado já está em uso.' } };
    }
    finalCode = slugCheck.slug;
  }

  const now = Math.floor(Date.now() / 1000);
  const mode = params.mode ?? 'static';

  const inserted = await params.db
    .prepare(
      `INSERT INTO links (longURL, shortURL, titleURL, user_id, mode, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id`
    )
    .bind(urlCheck.url, finalCode, params.title || null, params.userId, mode, now)
    .first<{ id: number }>();

  if (!inserted) {
    return { status: 500 as const, body: { error: 'Falha ao criar link.' } };
  }

  if (!finalCode) {
    finalCode = encodeId(inserted.id, params.hashSecret);
    const conflict = await params.db
      .prepare('SELECT id FROM links WHERE shortURL = ? AND id != ?')
      .bind(finalCode, inserted.id)
      .first();
    if (conflict) {
      finalCode = `${finalCode}-${inserted.id}`;
    }
    await params.db.prepare('UPDATE links SET shortURL = ? WHERE id = ?').bind(finalCode, inserted.id).run();
  }

  if (mode === 'dynamic') {
    const targetRow = await params.db
      .prepare(
        `INSERT INTO link_targets (link_id, label, target_url, priority, rule_type)
         VALUES (?, ?, ?, 0, 'manual')
         RETURNING id`
      )
      .bind(inserted.id, 'Destino Principal', urlCheck.url)
      .first<{ id: number }>();

    if (targetRow) {
      await params.db
        .prepare('UPDATE links SET active_target_id = ? WHERE id = ?')
        .bind(targetRow.id, inserted.id)
        .run();
    }
  }

  return {
    status: 201 as const,
    body: {
      id: inserted.id,
      short_code: finalCode,
      short_url: `${params.origin}/${finalCode}`,
      original_url: urlCheck.url,
      title: params.title || null,
      mode,
    },
  };
}

export const linkRoutes = new Hono<AppEnv>();

linkRoutes.use('*', requireAuth);

linkRoutes.get('/', requireFeature('links.manage_own'), async (c) => {
  const user = c.get('user')!;
  const { results } = await c.env.DB.prepare(
    `SELECT
      l.id,
      l.longURL AS longUrl,
      l.shortURL AS shortCode,
      l.titleURL AS title,
      l.mode,
      l.active_target_id AS activeTargetId,
      l.is_active AS isActive,
      l.total_clicks AS totalClicks,
      l.created_at AS createdAt,
      l.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM link_targets lt WHERE lt.link_id = l.id) AS targetsCount,
      (SELECT lt.label FROM link_targets lt WHERE lt.id = l.active_target_id) AS activeTargetLabel,
      (SELECT lt.target_url FROM link_targets lt WHERE lt.id = l.active_target_id) AS activeTargetUrl,
      (SELECT q.scan_count FROM qr_codes q WHERE q.link_id = l.id) AS qrScanCount,
      (SELECT q.id FROM qr_codes q WHERE q.link_id = l.id) AS qrId
    FROM links l
    WHERE l.user_id = ?
    ORDER BY l.created_at DESC, l.id DESC`
  )
    .bind(user.id)
    .all();

  const origin = new URL(c.req.url).origin;
  const items = results.map((row) => ({
    ...row,
    isActive: row.isActive === 1,
    hasQr: row.qrId !== null,
    shortUrl: `${origin}/${row.shortCode}`,
    qrUrl: `${origin}/q/${row.shortCode}`,
  }));

  return c.json({ links: items });
});

linkRoutes.post('/', requireFeature('links.create'), async (c) => {
  const user = c.get('user')!;
  const features = c.get('features');

  const parsed = createLinkSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, 400);
  }

  if (parsed.data.customSlug && !hasFeature(features, 'links.custom_slug')) {
    return c.json(
      { error: 'Slug personalizado não liberado para sua conta.', code: 'FEATURE_LOCKED', feature: 'links.custom_slug' },
      403
    );
  }

  if (parsed.data.mode === 'dynamic' && !hasFeature(features, 'url.dynamic_switch')) {
    return c.json(
      { error: 'URL dinâmica não liberada para sua conta.', code: 'FEATURE_LOCKED', feature: 'url.dynamic_switch' },
      403
    );
  }

  const limit = getFeatureLimit(features, 'links.create');
  if (limit !== null) {
    const count = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM links WHERE user_id = ?')
      .bind(user.id)
      .first<{ total: number }>();
    if ((count?.total ?? 0) >= limit) {
      return c.json({ error: `Limite de ${limit} links atingido para o seu plano.` }, 403);
    }
  }

  const origin = new URL(c.req.url).origin;
  const result = await createShortLink({
    db: c.env.DB,
    hashSecret: c.env.HASH_SECRET,
    origin,
    userId: user.id,
    url: parsed.data.url,
    title: parsed.data.title,
    customSlug: parsed.data.customSlug,
    mode: parsed.data.mode,
  });

  return c.json(result.body, result.status);
});

linkRoutes.get('/:id', requireFeature('links.manage_own'), async (c) => {
  const user = c.get('user')!;
  const linkId = Number(c.req.param('id'));
  if (!Number.isInteger(linkId)) return c.json({ error: 'ID inválido.' }, 400);

  const link = await c.env.DB.prepare(
    `SELECT id, longURL AS longUrl, shortURL AS shortCode, titleURL AS title, mode,
            active_target_id AS activeTargetId, is_active AS isActive, total_clicks AS totalClicks,
            created_at AS createdAt, updated_at AS updatedAt
     FROM links WHERE id = ? AND user_id = ?`
  )
    .bind(linkId, user.id)
    .first<Record<string, unknown>>();

  if (!link) return c.json({ error: 'Link não encontrado.' }, 404);

  const { results: targets } = await c.env.DB.prepare(
    `SELECT id, link_id AS linkId, label, target_url AS targetUrl, priority,
            rule_type AS ruleType, rule_config AS ruleConfig, is_active AS isActive,
            clicks_count AS clicksCount, created_at AS createdAt
     FROM link_targets WHERE link_id = ? ORDER BY priority ASC, id ASC`
  )
    .bind(linkId)
    .all();

  const qr = await c.env.DB.prepare(
    `SELECT id, is_dynamic AS isDynamic, style_json AS styleJson, scan_count AS scanCount, updated_at AS updatedAt
     FROM qr_codes WHERE link_id = ?`
  )
    .bind(linkId)
    .first();

  const origin = new URL(c.req.url).origin;

  return c.json({
    link: {
      ...link,
      isActive: link.isActive === 1,
      shortUrl: `${origin}/${link.shortCode}`,
      qrUrl: `${origin}/q/${link.shortCode}`,
    },
    targets: targets.map((t) => ({
      ...t,
      isActive: t.isActive === 1,
      ruleConfig: typeof t.ruleConfig === 'string' ? JSON.parse(t.ruleConfig) : null,
    })),
    qrCode: qr
      ? {
          ...qr,
          isDynamic: qr.isDynamic === 1,
          style: typeof qr.styleJson === 'string' ? JSON.parse(qr.styleJson) : {},
        }
      : null,
  });
});

linkRoutes.patch('/:id', requireFeature('links.manage_own'), async (c) => {
  const user = c.get('user')!;
  const features = c.get('features');
  const linkId = Number(c.req.param('id'));
  if (!Number.isInteger(linkId)) return c.json({ error: 'ID inválido.' }, 400);

  const existing = await c.env.DB.prepare('SELECT id, longURL, titleURL, mode, is_active FROM links WHERE id = ? AND user_id = ?')
    .bind(linkId, user.id)
    .first<{ id: number; longURL: string; titleURL: string | null; mode: 'static' | 'dynamic'; is_active: number }>();

  if (!existing) return c.json({ error: 'Link não encontrado.' }, 404);

  const parsed = updateLinkSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, 400);
  }

  let nextUrl = existing.longURL;
  if (parsed.data.url !== undefined) {
    const urlCheck = validateHttpUrl(parsed.data.url);
    if (!urlCheck.valid) return c.json({ error: urlCheck.error }, 400);
    nextUrl = urlCheck.url;
  }

  const nextMode = parsed.data.mode ?? existing.mode;
  if (nextMode === 'dynamic' && !hasFeature(features, 'url.dynamic_switch')) {
    return c.json(
      { error: 'URL dinâmica não liberada para sua conta.', code: 'FEATURE_LOCKED', feature: 'url.dynamic_switch' },
      403
    );
  }

  const nextTitle = parsed.data.title !== undefined ? parsed.data.title : existing.titleURL;
  const nextActive = parsed.data.isActive !== undefined ? (parsed.data.isActive ? 1 : 0) : existing.is_active;
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    `UPDATE links SET longURL = ?, titleURL = ?, mode = ?, is_active = ?, updated_at = ? WHERE id = ?`
  )
    .bind(nextUrl, nextTitle, nextMode, nextActive, now, linkId)
    .run();

  return c.json({ ok: true });
});

linkRoutes.delete('/:id', requireFeature('links.manage_own'), async (c) => {
  const user = c.get('user')!;
  const linkId = Number(c.req.param('id'));
  if (!Number.isInteger(linkId)) return c.json({ error: 'ID inválido.' }, 400);

  const res = await c.env.DB.prepare('DELETE FROM links WHERE id = ? AND user_id = ?').bind(linkId, user.id).run();
  if (!res.meta.changes) return c.json({ error: 'Link não encontrado.' }, 404);
  return c.json({ ok: true });
});

linkRoutes.post('/:id/targets', requireFeature('url.dynamic_switch'), async (c) => {
  const user = c.get('user')!;
  const features = c.get('features');
  const linkId = Number(c.req.param('id'));
  if (!Number.isInteger(linkId)) return c.json({ error: 'ID inválido.' }, 400);

  const link = await c.env.DB.prepare('SELECT id FROM links WHERE id = ? AND user_id = ?')
    .bind(linkId, user.id)
    .first();
  if (!link) return c.json({ error: 'Link não encontrado.' }, 404);

  const parsed = createTargetSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, 400);
  }

  if (parsed.data.ruleType !== 'manual' && !hasFeature(features, 'url.conditional_rules')) {
    return c.json(
      {
        error: 'Regras condicionais automáticas não liberadas para sua conta.',
        code: 'FEATURE_LOCKED',
        feature: 'url.conditional_rules',
      },
      403
    );
  }

  const targetLimit = getFeatureLimit(features, 'url.dynamic_switch');
  if (targetLimit !== null) {
    const count = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM link_targets WHERE link_id = ?')
      .bind(linkId)
      .first<{ total: number }>();
    if ((count?.total ?? 0) >= targetLimit) {
      return c.json({ error: `Limite de ${targetLimit} destinos por link atingido.` }, 403);
    }
  }

  const urlCheck = validateHttpUrl(parsed.data.targetUrl);
  if (!urlCheck.valid) return c.json({ error: urlCheck.error }, 400);

  const inserted = await c.env.DB.prepare(
    `INSERT INTO link_targets (link_id, label, target_url, priority, rule_type, rule_config, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id`
  )
    .bind(
      linkId,
      parsed.data.label,
      urlCheck.url,
      parsed.data.priority,
      parsed.data.ruleType,
      parsed.data.ruleConfig ? JSON.stringify(parsed.data.ruleConfig) : null,
      parsed.data.isActive ? 1 : 0
    )
    .first<{ id: number }>();

  if (!inserted) return c.json({ error: 'Falha ao criar destino.' }, 500);

  const now = Math.floor(Date.now() / 1000);
  if (parsed.data.setAsActive) {
    await c.env.DB.prepare(
      `UPDATE links SET mode = 'dynamic', active_target_id = ?, updated_at = ? WHERE id = ?`
    )
      .bind(inserted.id, now, linkId)
      .run();
  } else {
    await c.env.DB.prepare(`UPDATE links SET mode = 'dynamic', updated_at = ? WHERE id = ?`)
      .bind(now, linkId)
      .run();
  }

  return c.json({ id: inserted.id }, 201);
});

linkRoutes.patch('/:id/targets/:targetId', requireFeature('url.dynamic_switch'), async (c) => {
  const user = c.get('user')!;
  const features = c.get('features');
  const linkId = Number(c.req.param('id'));
  const targetId = Number(c.req.param('targetId'));
  if (!Number.isInteger(linkId) || !Number.isInteger(targetId)) {
    return c.json({ error: 'ID inválido.' }, 400);
  }

  const existing = await c.env.DB.prepare(
    `SELECT lt.id, lt.label, lt.target_url, lt.priority, lt.rule_type, lt.rule_config, lt.is_active
     FROM link_targets lt
     JOIN links l ON l.id = lt.link_id
     WHERE lt.id = ? AND lt.link_id = ? AND l.user_id = ?`
  )
    .bind(targetId, linkId, user.id)
    .first<{
      id: number;
      label: string;
      target_url: string;
      priority: number;
      rule_type: string;
      rule_config: string | null;
      is_active: number;
    }>();

  if (!existing) return c.json({ error: 'Destino não encontrado.' }, 404);

  const parsed = updateTargetSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, 400);
  }

  const nextRuleType = parsed.data.ruleType ?? existing.rule_type;
  if (nextRuleType !== 'manual' && !hasFeature(features, 'url.conditional_rules')) {
    return c.json(
      {
        error: 'Regras condicionais automáticas não liberadas para sua conta.',
        code: 'FEATURE_LOCKED',
        feature: 'url.conditional_rules',
      },
      403
    );
  }

  let nextUrl = existing.target_url;
  if (parsed.data.targetUrl !== undefined) {
    const urlCheck = validateHttpUrl(parsed.data.targetUrl);
    if (!urlCheck.valid) return c.json({ error: urlCheck.error }, 400);
    nextUrl = urlCheck.url;
  }

  const nextConfig =
    parsed.data.ruleConfig !== undefined
      ? parsed.data.ruleConfig
        ? JSON.stringify(parsed.data.ruleConfig)
        : null
      : existing.rule_config;

  await c.env.DB.prepare(
    `UPDATE link_targets
     SET label = ?, target_url = ?, priority = ?, rule_type = ?, rule_config = ?, is_active = ?
     WHERE id = ? AND link_id = ?`
  )
    .bind(
      parsed.data.label ?? existing.label,
      nextUrl,
      parsed.data.priority ?? existing.priority,
      nextRuleType,
      nextConfig,
      parsed.data.isActive !== undefined ? (parsed.data.isActive ? 1 : 0) : existing.is_active,
      targetId,
      linkId
    )
    .run();

  return c.json({ ok: true });
});

linkRoutes.delete('/:id/targets/:targetId', requireFeature('url.dynamic_switch'), async (c) => {
  const user = c.get('user')!;
  const linkId = Number(c.req.param('id'));
  const targetId = Number(c.req.param('targetId'));
  if (!Number.isInteger(linkId) || !Number.isInteger(targetId)) {
    return c.json({ error: 'ID inválido.' }, 400);
  }

  const link = await c.env.DB.prepare('SELECT id, active_target_id FROM links WHERE id = ? AND user_id = ?')
    .bind(linkId, user.id)
    .first<{ id: number; active_target_id: number | null }>();
  if (!link) return c.json({ error: 'Link não encontrado.' }, 404);

  const res = await c.env.DB.prepare('DELETE FROM link_targets WHERE id = ? AND link_id = ?')
    .bind(targetId, linkId)
    .run();
  if (!res.meta.changes) return c.json({ error: 'Destino não encontrado.' }, 404);

  if (link.active_target_id === targetId) {
    await c.env.DB.prepare('UPDATE links SET active_target_id = NULL WHERE id = ?').bind(linkId).run();
  }

  return c.json({ ok: true });
});

linkRoutes.patch('/:id/active-target', requireFeature('url.dynamic_switch'), async (c) => {
  const user = c.get('user')!;
  const linkId = Number(c.req.param('id'));
  if (!Number.isInteger(linkId)) return c.json({ error: 'ID inválido.' }, 400);

  const body = (await c.req.json().catch(() => null)) as { targetId?: number | null } | null;
  const targetId = body?.targetId ?? null;

  const link = await c.env.DB.prepare('SELECT id FROM links WHERE id = ? AND user_id = ?')
    .bind(linkId, user.id)
    .first();
  if (!link) return c.json({ error: 'Link não encontrado.' }, 404);

  if (targetId !== null) {
    const target = await c.env.DB.prepare('SELECT id FROM link_targets WHERE id = ? AND link_id = ?')
      .bind(targetId, linkId)
      .first();
    if (!target) return c.json({ error: 'Destino não encontrado neste link.' }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `UPDATE links SET mode = 'dynamic', active_target_id = ?, updated_at = ? WHERE id = ?`
  )
    .bind(targetId, now, linkId)
    .run();

  return c.json({ ok: true, activeTargetId: targetId });
});
