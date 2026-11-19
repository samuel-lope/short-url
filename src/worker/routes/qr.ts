import { Hono } from 'hono';
import { qrStyleSchema } from '../../shared/contracts.ts';
import type { AppEnv } from '../types.ts';
import { requireAuth, requireFeature } from '../middleware/featureGate.ts';
import { getFeatureLimit } from '../services/entitlements.ts';
import { safeJsonParse } from '../services/validation.ts';

export const qrRoutes = new Hono<AppEnv>();

qrRoutes.use('*', requireAuth);

qrRoutes.get('/:linkId', async (c) => {
  const user = c.get('user')!;
  const linkId = Number(c.req.param('linkId'));
  if (!Number.isInteger(linkId)) return c.json({ error: 'ID inválido.' }, 400);

  const link = await c.env.DB.prepare('SELECT id, shortURL AS shortCode FROM links WHERE id = ? AND user_id = ?')
    .bind(linkId, user.id)
    .first<{ id: number; shortCode: string }>();
  if (!link) return c.json({ error: 'Link não encontrado.' }, 404);

  const qr = await c.env.DB.prepare(
    'SELECT id, is_dynamic AS isDynamic, style_json AS styleJson, scan_count AS scanCount FROM qr_codes WHERE link_id = ?'
  )
    .bind(linkId)
    .first<{ id: number; isDynamic: number; styleJson: string; scanCount: number }>();

  const origin = new URL(c.req.url).origin;

  return c.json({
    qrUrl: `${origin}/q/${link.shortCode}`,
    qrCode: qr
      ? {
          id: qr.id,
          isDynamic: qr.isDynamic === 1,
          style: safeJsonParse<Record<string, unknown>>(qr.styleJson, {}),
          scanCount: qr.scanCount,
        }
      : null,
  });
});

qrRoutes.put('/:linkId', requireFeature('qr.dynamic'), async (c) => {
  const user = c.get('user')!;
  const features = c.get('features');
  const linkId = Number(c.req.param('linkId'));
  if (!Number.isInteger(linkId)) return c.json({ error: 'ID inválido.' }, 400);

  const link = await c.env.DB.prepare('SELECT id, shortURL AS shortCode FROM links WHERE id = ? AND user_id = ?')
    .bind(linkId, user.id)
    .first<{ id: number; shortCode: string }>();
  if (!link) return c.json({ error: 'Link não encontrado.' }, 404);

  const rawBody = (await c.req.json().catch(() => ({}))) as { style?: unknown };
  const parsedStyle = qrStyleSchema.safeParse(rawBody.style ?? {});
  if (!parsedStyle.success) {
    return c.json({ error: parsedStyle.error.issues[0]?.message ?? 'Estilo de QR inválido.' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM qr_codes WHERE link_id = ?')
    .bind(linkId)
    .first<{ id: number }>();

  const now = Math.floor(Date.now() / 1000);
  const styleJson = JSON.stringify(parsedStyle.data);

  if (!existing) {
    const qrLimit = getFeatureLimit(features, 'qr.dynamic');
    if (qrLimit !== null) {
      const count = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM qr_codes WHERE user_id = ?')
        .bind(user.id)
        .first<{ total: number }>();
      if ((count?.total ?? 0) >= qrLimit) {
        return c.json({ error: `Limite de ${qrLimit} QR Codes dinâmicos atingido.` }, 403);
      }
    }

    const inserted = await c.env.DB.prepare(
      `INSERT INTO qr_codes (link_id, user_id, is_dynamic, style_json, updated_at)
       VALUES (?, ?, 1, ?, ?)
       RETURNING id`
    )
      .bind(linkId, user.id, styleJson, now)
      .first<{ id: number }>();

    const origin = new URL(c.req.url).origin;
    return c.json(
      {
        id: inserted?.id,
        qrUrl: `${origin}/q/${link.shortCode}`,
        style: parsedStyle.data,
        scanCount: 0,
      },
      201
    );
  }

  await c.env.DB.prepare('UPDATE qr_codes SET style_json = ?, updated_at = ? WHERE id = ?')
    .bind(styleJson, now, existing.id)
    .run();

  const origin = new URL(c.req.url).origin;
  return c.json({
    id: existing.id,
    qrUrl: `${origin}/q/${link.shortCode}`,
    style: parsedStyle.data,
  });
});
