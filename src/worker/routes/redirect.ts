import type { Context } from 'hono';
import type { AppEnv } from '../types.ts';
import { decodeCode } from '../services/hashids.ts';
import { resolveDestination, type LinkRow, type LinkTargetRow } from '../services/routerEngine.ts';
import { extractRequestMeta, recordClickEvent } from '../services/tracking.ts';
import { runInBackground } from '../services/runtime.ts';

export async function handleShortRedirect(
  c: Context<AppEnv>,
  code: string,
  source: 'link' | 'qr'
): Promise<Response> {
  const db = c.env.DB;
  if (!db) {
    return c.text('Serviço indisponível.', 503);
  }

  let link = await db
    .prepare(
      `SELECT id, longURL, shortURL, mode, active_target_id, is_active
       FROM links WHERE shortURL = ?`
    )
    .bind(code)
    .first<LinkRow>();

  // Legacy Hashids fallback if shortURL column was null or unindexed
  if (!link && c.env.HASH_SECRET) {
    const decodedId = decodeCode(code, c.env.HASH_SECRET);
    if (decodedId !== null) {
      link = await db
        .prepare(
          `SELECT id, longURL, shortURL, mode, active_target_id, is_active
           FROM links WHERE id = ?`
        )
        .bind(decodedId)
        .first<LinkRow>();
    }
  }

  if (!link || link.is_active !== 1) {
    return c.text('URL não encontrada ou desativada.', 404);
  }

  let targets: LinkTargetRow[] = [];
  if (link.mode === 'dynamic') {
    const res = await db
      .prepare(
        `SELECT id, link_id, label, target_url, priority, rule_type, rule_config, is_active
         FROM link_targets WHERE link_id = ? AND is_active = 1
         ORDER BY priority ASC, id ASC`
      )
      .bind(link.id)
      .all<LinkTargetRow>();
    targets = res.results;
  }

  const meta = extractRequestMeta(c.req.raw);
  const { targetUrl, targetId } = resolveDestination(link, targets, meta);

  const clickPromise = recordClickEvent(db, {
    linkId: link.id,
    targetId,
    source: c.req.query('s') === 'qr' ? 'qr' : source,
    request: c.req.raw,
    ipSalt: c.env.IP_HASH_SALT || c.env.HASH_SECRET || 'short-url-default-salt',
    meta,
  }).catch((err) => {
    console.error('Tracking write failed:', err);
  });

  await runInBackground(c, clickPromise, { awaitFallback: true });

  return new Response(null, {
    status: 302,
    headers: {
      Location: targetUrl,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
    },
  });
}
