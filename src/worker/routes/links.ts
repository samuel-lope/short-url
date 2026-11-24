import { Hono } from 'hono';
import {
  createLinkSchema,
  createTargetSchema,
  updateLinkSchema,
  updateTargetSchema,
  type QrStyle,
  type RuleConfig,
  type RuleType,
} from '../../shared/contracts.ts';
import type { AppEnv } from '../types.ts';
import { requireAuth, requireFeature } from '../middleware/featureGate.ts';
import { getFeatureLimit, hasFeature } from '../services/entitlements.ts';
import { encodeId } from '../services/hashids.ts';
import { apiError } from '../services/runtime.ts';
import {
  isUniqueConstraintError,
  safeJsonParse,
  validateCustomSlug,
  validateHttpUrl,
} from '../services/validation.ts';

interface LinkListRow {
  id: number;
  longUrl: string;
  shortCode: string;
  title: string | null;
  mode: 'static' | 'dynamic';
  activeTargetId: number | null;
  isActive: number;
  totalClicks: number;
  createdAt: number;
  updatedAt: number | null;
  targetsCount: number;
  activeTargetLabel: string | null;
  activeTargetUrl: string | null;
  qrScanCount: number | null;
  qrId: number | null;
}

interface LinkDetailRow {
  id: number;
  longUrl: string;
  shortCode: string;
  title: string | null;
  mode: 'static' | 'dynamic';
  activeTargetId: number | null;
  isActive: number;
  totalClicks: number;
  createdAt: number;
  updatedAt: number | null;
}

interface LinkTargetDbRow {
  id: number;
  linkId: number;
  label: string;
  targetUrl: string;
  priority: number;
  ruleType: RuleType;
  ruleConfig: string | null;
  isActive: number;
  clicksCount: number;
  createdAt: number;
}

interface QrCodeDbRow {
  id: number;
  isDynamic: number;
  styleJson: string;
  scanCount: number;
  updatedAt: number;
}

function getRequestHost(originOrUrl: string): string[] {
  try {
    return [new URL(originOrUrl).hostname];
  } catch {
    return [];
  }
}

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
  const blockedHosts = getRequestHost(params.origin);
  const urlCheck = validateHttpUrl(params.url, blockedHosts);
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

  let inserted: { id: number } | null = null;
  try {
    inserted = await params.db
      .prepare(
        `INSERT INTO links (longURL, shortURL, titleURL, user_id, mode, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id`
      )
      .bind(urlCheck.url, finalCode, params.title || null, params.userId, mode, now)
      .first<{ id: number }>();
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { status: 409 as const, body: { error: 'Este slug personalizado já está em uso.' } };
    }
    throw err;
  }

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
    try {
      await params.db.prepare('UPDATE links SET shortURL = ? WHERE id = ?').bind(finalCode, inserted.id).run();
    } catch (err) {
      await params.db.prepare('DELETE FROM links WHERE id = ?').bind(inserted.id).run().catch(() => {});
      throw err;
    }
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
  const q = (c.req.query('q') ?? '').trim();
  const modeFilter = c.req.query('mode');
  const pageRaw = Number(c.req.query('page') ?? '1');
  const limitRaw = Number(c.req.query('limit') ?? '25');
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25;
  const offset = (page - 1) * limit;

  const whereClauses = ['l.user_id = ?'];
  const bindings: unknown[] = [user.id];

  if (modeFilter === 'static' || modeFilter === 'dynamic') {
    whereClauses.push('l.mode = ?');
    bindings.push(modeFilter);
  }

  if (q) {
    whereClauses.push('(l.shortURL LIKE ? OR l.titleURL LIKE ? OR l.longURL LIKE ?)');
    const like = `%${q}%`;
    bindings.push(like, like, like);
  }

  const whereSql = whereClauses.join(' AND ');

  const [countRow, rowsRes] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM links l WHERE ${whereSql}`)
      .bind(...bindings)
      .first<{ total: number }>(),
    c.env.DB.prepare(
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
        COALESCE(tc.cnt, 0) AS targetsCount,
        at.label AS activeTargetLabel,
        at.target_url AS activeTargetUrl,
        q.scan_count AS qrScanCount,
        q.id AS qrId
      FROM links l
      LEFT JOIN (
        SELECT link_id, COUNT(*) AS cnt FROM link_targets GROUP BY link_id
      ) tc ON tc.link_id = l.id
      LEFT JOIN link_targets at ON at.id = l.active_target_id
      LEFT JOIN qr_codes q ON q.link_id = l.id
      WHERE ${whereSql}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ? OFFSET ?`
    )
      .bind(...bindings, limit, offset)
      .all<LinkListRow>(),
  ]);

  const total = countRow?.total ?? 0;
  const origin = new URL(c.req.url).origin;
  const items = rowsRes.results.map((row) => ({
    ...row,
    isActive: row.isActive === 1,
    hasQr: row.qrId !== null,
    shortUrl: `${origin}/${row.shortCode}`,
    qrUrl: `${origin}/q/${row.shortCode}`,
  }));

  return c.json({
    links: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

linkRoutes.post('/', requireFeature('links.create'), async (c) => {
  const user = c.get('user')!;
  const features = c.get('features');

  const parsed = createLinkSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(c, 400, parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  }

  if (parsed.data.customSlug && !hasFeature(features, 'links.custom_slug')) {
    return apiError(c, 403, 'Slug personalizado não liberado para sua conta.', {
      code: 'FEATURE_LOCKED',
      feature: 'links.custom_slug',
    });
  }

  if (parsed.data.mode === 'dynamic' && !hasFeature(features, 'url.dynamic_switch')) {
    return apiError(c, 403, 'URL dinâmica não liberada para sua conta.', {
      code: 'FEATURE_LOCKED',
      feature: 'url.dynamic_switch',
    });
  }

  const limit = getFeatureLimit(features, 'links.create');
  if (limit !== null) {
    const count = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM links WHERE user_id = ?')
      .bind(user.id)
      .first<{ total: number }>();
    if ((count?.total ?? 0) >= limit) {
      return apiError(c, 403, `Limite de ${limit} links atingido para o seu perfil.`);
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
  if (!Number.isInteger(linkId)) return apiError(c, 400, 'ID inválido.');

  const link = await c.env.DB.prepare(
    `SELECT id, longURL AS longUrl, shortURL AS shortCode, titleURL AS title, mode,
            active_target_id AS activeTargetId, is_active AS isActive, total_clicks AS totalClicks,
            created_at AS createdAt, updated_at AS updatedAt
     FROM links WHERE id = ? AND user_id = ?`
  )
    .bind(linkId, user.id)
    .first<LinkDetailRow>();

  if (!link) return apiError(c, 404, 'Link não encontrado.');

  const [targetsRes, qr] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, link_id AS linkId, label, target_url AS targetUrl, priority,
              rule_type AS ruleType, rule_config AS ruleConfig, is_active AS isActive,
              clicks_count AS clicksCount, created_at AS createdAt
       FROM link_targets WHERE link_id = ? ORDER BY priority ASC, id ASC`
    )
      .bind(linkId)
      .all<LinkTargetDbRow>(),
    c.env.DB.prepare(
      `SELECT id, is_dynamic AS isDynamic, style_json AS styleJson, scan_count AS scanCount, updated_at AS updatedAt
       FROM qr_codes WHERE link_id = ?`
    )
      .bind(linkId)
      .first<QrCodeDbRow>(),
  ]);

  const origin = new URL(c.req.url).origin;

  return c.json({
    link: {
      ...link,
      isActive: link.isActive === 1,
      shortUrl: `${origin}/${link.shortCode}`,
      qrUrl: `${origin}/q/${link.shortCode}`,
    },
    targets: targetsRes.results.map((t) => ({
      ...t,
      isActive: t.isActive === 1,
      ruleConfig: safeJsonParse<RuleConfig>(t.ruleConfig, null),
    })),
    qrCode: qr
      ? {
          ...qr,
          isDynamic: qr.isDynamic === 1,
          style: safeJsonParse<Partial<QrStyle>>(qr.styleJson, {}),
        }
      : null,
  });
});

linkRoutes.patch('/:id', requireFeature('links.manage_own'), async (c) => {
  const user = c.get('user')!;
  const features = c.get('features');
  const linkId = Number(c.req.param('id'));
  if (!Number.isInteger(linkId)) return apiError(c, 400, 'ID inválido.');

  const existing = await c.env.DB.prepare(
    'SELECT id, longURL, titleURL, mode, is_active FROM links WHERE id = ? AND user_id = ?'
  )
    .bind(linkId, user.id)
    .first<{ id: number; longURL: string; titleURL: string | null; mode: 'static' | 'dynamic'; is_active: number }>();

  if (!existing) return apiError(c, 404, 'Link não encontrado.');

  const parsed = updateLinkSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(c, 400, parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  }

  let nextUrl = existing.longURL;
  if (parsed.data.url !== undefined) {
    const urlCheck = validateHttpUrl(parsed.data.url, getRequestHost(c.req.url));
    if (!urlCheck.valid) return apiError(c, 400, urlCheck.error);
    nextUrl = urlCheck.url;
  }

  const nextMode = parsed.data.mode ?? existing.mode;
  if (nextMode === 'dynamic' && !hasFeature(features, 'url.dynamic_switch')) {
    return apiError(c, 403, 'URL dinâmica não liberada para sua conta.', {
      code: 'FEATURE_LOCKED',
      feature: 'url.dynamic_switch',
    });
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
  if (!Number.isInteger(linkId)) return apiError(c, 400, 'ID inválido.');

  const res = await c.env.DB.prepare('DELETE FROM links WHERE id = ? AND user_id = ?').bind(linkId, user.id).run();
  if (!res.meta.changes) return apiError(c, 404, 'Link não encontrado.');
  return c.json({ ok: true });
});

linkRoutes.post('/:id/targets', requireFeature('url.dynamic_switch'), async (c) => {
  const user = c.get('user')!;
  const features = c.get('features');
  const linkId = Number(c.req.param('id'));
  if (!Number.isInteger(linkId)) return apiError(c, 400, 'ID inválido.');

  const link = await c.env.DB.prepare('SELECT id FROM links WHERE id = ? AND user_id = ?')
    .bind(linkId, user.id)
    .first();
  if (!link) return apiError(c, 404, 'Link não encontrado.');

  const parsed = createTargetSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(c, 400, parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  }

  if (parsed.data.ruleType !== 'manual' && !hasFeature(features, 'url.conditional_rules')) {
    return apiError(c, 403, 'Regras condicionais automáticas não liberadas para sua conta.', {
      code: 'FEATURE_LOCKED',
      feature: 'url.conditional_rules',
    });
  }

  const targetLimit = getFeatureLimit(features, 'url.dynamic_switch');
  if (targetLimit !== null) {
    const count = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM link_targets WHERE link_id = ?')
      .bind(linkId)
      .first<{ total: number }>();
    if ((count?.total ?? 0) >= targetLimit) {
      return apiError(c, 403, `Limite de ${targetLimit} destinos por link atingido.`);
    }
  }

  const urlCheck = validateHttpUrl(parsed.data.targetUrl, getRequestHost(c.req.url));
  if (!urlCheck.valid) return apiError(c, 400, urlCheck.error);

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

  if (!inserted) return apiError(c, 500, 'Falha ao criar destino.');

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
    return apiError(c, 400, 'ID inválido.');
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

  if (!existing) return apiError(c, 404, 'Destino não encontrado.');

  const parsed = updateTargetSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(c, 400, parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  }

  const nextRuleType = parsed.data.ruleType ?? existing.rule_type;
  if (nextRuleType !== 'manual' && !hasFeature(features, 'url.conditional_rules')) {
    return apiError(c, 403, 'Regras condicionais automáticas não liberadas para sua conta.', {
      code: 'FEATURE_LOCKED',
      feature: 'url.conditional_rules',
    });
  }

  let nextUrl = existing.target_url;
  if (parsed.data.targetUrl !== undefined) {
    const urlCheck = validateHttpUrl(parsed.data.targetUrl, getRequestHost(c.req.url));
    if (!urlCheck.valid) return apiError(c, 400, urlCheck.error);
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
    return apiError(c, 400, 'ID inválido.');
  }

  const link = await c.env.DB.prepare('SELECT id, active_target_id FROM links WHERE id = ? AND user_id = ?')
    .bind(linkId, user.id)
    .first<{ id: number; active_target_id: number | null }>();
  if (!link) return apiError(c, 404, 'Link não encontrado.');

  const targetExists = await c.env.DB.prepare('SELECT id FROM link_targets WHERE id = ? AND link_id = ?')
    .bind(targetId, linkId)
    .first();
  if (!targetExists) return apiError(c, 404, 'Destino não encontrado.');

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare('DELETE FROM link_targets WHERE id = ? AND link_id = ?').bind(targetId, linkId),
  ];
  if (link.active_target_id === targetId) {
    statements.push(c.env.DB.prepare('UPDATE links SET active_target_id = NULL WHERE id = ?').bind(linkId));
  }
  await c.env.DB.batch(statements);

  return c.json({ ok: true });
});

linkRoutes.patch('/:id/active-target', requireFeature('url.dynamic_switch'), async (c) => {
  const user = c.get('user')!;
  const linkId = Number(c.req.param('id'));
  if (!Number.isInteger(linkId)) return apiError(c, 400, 'ID inválido.');

  const body = (await c.req.json().catch(() => null)) as { targetId?: number | null } | null;
  const targetId = body?.targetId ?? null;

  const link = await c.env.DB.prepare('SELECT id FROM links WHERE id = ? AND user_id = ?')
    .bind(linkId, user.id)
    .first();
  if (!link) return apiError(c, 404, 'Link não encontrado.');

  if (targetId !== null) {
    const target = await c.env.DB.prepare('SELECT id FROM link_targets WHERE id = ? AND link_id = ?')
      .bind(targetId, linkId)
      .first();
    if (!target) return apiError(c, 404, 'Destino não encontrado neste link.');
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `UPDATE links SET mode = 'dynamic', active_target_id = ?, updated_at = ? WHERE id = ?`
  )
    .bind(targetId, now, linkId)
    .run();

  return c.json({ ok: true, activeTargetId: targetId });
});
