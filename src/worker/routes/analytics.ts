import { Hono } from 'hono';
import type { AppEnv } from '../types.ts';
import { requireAuth, requireFeature } from '../middleware/featureGate.ts';
import { hasFeature } from '../services/entitlements.ts';

export const analyticsRoutes = new Hono<AppEnv>();

analyticsRoutes.use('*', requireAuth);

analyticsRoutes.get('/overview', requireFeature('analytics.basic'), async (c) => {
  const user = c.get('user')!;
  const since = Math.floor(Date.now() / 1000) - 30 * 86400;

  const [summary, qrSummary, dailyRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT
        COUNT(*) AS totalLinks,
        COALESCE(SUM(total_clicks), 0) AS totalClicks,
        SUM(CASE WHEN mode = 'dynamic' THEN 1 ELSE 0 END) AS dynamicLinks
       FROM links WHERE user_id = ?`
    )
      .bind(user.id)
      .first<{ totalLinks: number; totalClicks: number; dynamicLinks: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS totalQrCodes, COALESCE(SUM(scan_count), 0) AS totalScans
       FROM qr_codes WHERE user_id = ?`
    )
      .bind(user.id)
      .first<{ totalQrCodes: number; totalScans: number }>(),
    c.env.DB.prepare(
      `SELECT
        strftime('%Y-%m-%d', ce.clicked_at, 'unixepoch') AS day,
        COUNT(*) AS total,
        SUM(CASE WHEN ce.source = 'qr' THEN 1 ELSE 0 END) AS qrScans,
        SUM(CASE WHEN ce.source = 'link' THEN 1 ELSE 0 END) AS linkClicks
       FROM click_events ce
       JOIN links l ON l.id = ce.link_id
       WHERE l.user_id = ? AND ce.clicked_at >= ?
       GROUP BY day
       ORDER BY day ASC`
    )
      .bind(user.id, since)
      .all(),
  ]);

  return c.json({
    summary: {
      totalLinks: summary?.totalLinks ?? 0,
      totalClicks: summary?.totalClicks ?? 0,
      dynamicLinks: summary?.dynamicLinks ?? 0,
      totalQrCodes: qrSummary?.totalQrCodes ?? 0,
      totalScans: qrSummary?.totalScans ?? 0,
    },
    dailySeries: dailyRes.results,
  });
});

analyticsRoutes.get('/links/:linkId', requireFeature('analytics.basic'), async (c) => {
  const user = c.get('user')!;
  const features = c.get('features');
  const linkId = Number(c.req.param('linkId'));
  if (!Number.isInteger(linkId)) return c.json({ error: 'ID inválido.' }, 400);

  const link = await c.env.DB.prepare(
    'SELECT id, shortURL AS shortCode, titleURL AS title, total_clicks AS totalClicks FROM links WHERE id = ? AND user_id = ?'
  )
    .bind(linkId, user.id)
    .first<{ id: number; shortCode: string; title: string | null; totalClicks: number }>();
  if (!link) return c.json({ error: 'Link não encontrado.' }, 404);

  const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const detailedEnabled = hasFeature(features, 'analytics.detailed');

  const [totals, dailyRes, byTargetRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT
        COUNT(*) AS recordedEvents,
        COUNT(DISTINCT ip_hash) AS uniqueVisitors,
        SUM(CASE WHEN source = 'qr' THEN 1 ELSE 0 END) AS qrScans,
        SUM(CASE WHEN source = 'link' THEN 1 ELSE 0 END) AS linkClicks
       FROM click_events WHERE link_id = ?`
    )
      .bind(linkId)
      .first(),
    c.env.DB.prepare(
      `SELECT
        strftime('%Y-%m-%d', clicked_at, 'unixepoch') AS day,
        COUNT(*) AS total,
        SUM(CASE WHEN source = 'qr' THEN 1 ELSE 0 END) AS qrScans,
        SUM(CASE WHEN source = 'link' THEN 1 ELSE 0 END) AS linkClicks
       FROM click_events
       WHERE link_id = ? AND clicked_at >= ?
       GROUP BY day
       ORDER BY day ASC`
    )
      .bind(linkId, since)
      .all(),
    c.env.DB.prepare(
      `SELECT id, label, target_url AS targetUrl, clicks_count AS clicksCount
       FROM link_targets WHERE link_id = ? ORDER BY clicks_count DESC`
    )
      .bind(linkId)
      .all(),
  ]);

  let detailed: Record<string, unknown> | null = null;

  if (detailedEnabled) {
    const [countries, devices, osList, referers, recent] = await Promise.all([
      c.env.DB.prepare(
        `SELECT COALESCE(country, 'Desconhecido') AS label, COUNT(*) AS count
         FROM click_events WHERE link_id = ? GROUP BY label ORDER BY count DESC LIMIT 10`
      )
        .bind(linkId)
        .all(),
      c.env.DB.prepare(
        `SELECT COALESCE(device_type, 'desktop') AS label, COUNT(*) AS count
         FROM click_events WHERE link_id = ? GROUP BY label ORDER BY count DESC`
      )
        .bind(linkId)
        .all(),
      c.env.DB.prepare(
        `SELECT COALESCE(os, 'Other') AS label, COUNT(*) AS count
         FROM click_events WHERE link_id = ? GROUP BY label ORDER BY count DESC`
      )
        .bind(linkId)
        .all(),
      c.env.DB.prepare(
        `SELECT COALESCE(referer, 'Direto') AS label, COUNT(*) AS count
         FROM click_events WHERE link_id = ? GROUP BY label ORDER BY count DESC LIMIT 10`
      )
        .bind(linkId)
        .all(),
      c.env.DB.prepare(
        `SELECT id, source, clicked_at AS clickedAt, country, city, device_type AS deviceType, os, browser, referer
         FROM click_events WHERE link_id = ? ORDER BY clicked_at DESC LIMIT 20`
      )
        .bind(linkId)
        .all(),
    ]);

    detailed = {
      byCountry: countries.results,
      byDevice: devices.results,
      byOs: osList.results,
      byReferer: referers.results,
      recentEvents: recent.results,
    };
  }

  return c.json({
    link,
    totals,
    dailySeries: dailyRes.results,
    byTarget: byTargetRes.results,
    detailedLocked: !detailedEnabled,
    detailed,
  });
});
