import { sha256Hex } from './crypto.ts';
import type { RequestContextMeta } from './routerEngine.ts';

export interface ParsedUserAgent {
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'bot';
  os: 'iOS' | 'Android' | 'Windows' | 'macOS' | 'Linux' | 'Other';
  browser: string;
}

export function parseUserAgent(uaRaw: string | null): ParsedUserAgent {
  const ua = uaRaw ?? '';

  let deviceType: ParsedUserAgent['deviceType'] = 'desktop';
  if (/bot|crawler|spider|slurp|bingpreview|curl|wget|headless/i.test(ua)) {
    deviceType = 'bot';
  } else if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/mobile|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini/i.test(ua)) {
    deviceType = 'mobile';
  }

  let os: ParsedUserAgent['os'] = 'Other';
  if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Other';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua)) browser = 'Safari';

  return { deviceType, os, browser };
}

export function extractRequestMeta(request: Request): RequestContextMeta & {
  browser: string;
  city: string | null;
  referer: string | null;
} {
  const ua = parseUserAgent(request.headers.get('User-Agent'));
  const cf = (request as Request & { cf?: { country?: string; city?: string } }).cf;
  const refererRaw = request.headers.get('Referer');
  let referer: string | null = null;
  if (refererRaw) {
    try {
      referer = new URL(refererRaw).hostname;
    } catch {
      referer = refererRaw.slice(0, 120);
    }
  }

  return {
    deviceType: ua.deviceType,
    os: ua.os,
    browser: ua.browser,
    country: cf?.country ?? request.headers.get('CF-IPCountry') ?? null,
    city: cf?.city ?? null,
    referer,
    nowEpoch: Math.floor(Date.now() / 1000),
  };
}

export async function recordClickEvent(
  db: D1Database,
  params: {
    linkId: number;
    targetId: number | null;
    source: 'link' | 'qr';
    request: Request;
    ipSalt: string;
    meta: ReturnType<typeof extractRequestMeta>;
  }
): Promise<void> {
  const ip =
    params.request.headers.get('CF-Connecting-IP') ||
    params.request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown';
  const dayBucket = new Date(params.meta.nowEpoch * 1000).toISOString().slice(0, 10);
  const ipHash = await sha256Hex(`${params.ipSalt}:${dayBucket}:${ip}`);

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO click_events (link_id, target_id, source, clicked_at, country, city, device_type, os, browser, referer, ip_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        params.linkId,
        params.targetId,
        params.source,
        params.meta.nowEpoch,
        params.meta.country,
        params.meta.city,
        params.meta.deviceType,
        params.meta.os,
        params.meta.browser,
        params.meta.referer,
        ipHash
      ),
    db
      .prepare('UPDATE links SET total_clicks = total_clicks + 1 WHERE id = ?')
      .bind(params.linkId),
  ];

  if (params.targetId !== null) {
    statements.push(
      db
        .prepare('UPDATE link_targets SET clicks_count = clicks_count + 1 WHERE id = ?')
        .bind(params.targetId)
    );
  }

  if (params.source === 'qr') {
    statements.push(
      db
        .prepare('UPDATE qr_codes SET scan_count = scan_count + 1 WHERE link_id = ?')
        .bind(params.linkId)
    );
  }

  await db.batch(statements);
}
