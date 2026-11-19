import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.ts';
import { sha256Hex } from '../services/crypto.ts';

interface RateLimitOptions {
  scope: string;
  maxRequests: number;
  windowSeconds: number;
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const db = c.env.DB;
    if (!db) {
      await next();
      return;
    }

    const ip =
      c.req.header('CF-Connecting-IP') ||
      c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
      'local';
    const ipHash = await sha256Hex(`${options.scope}:${ip}`);
    const bucketKey = `${options.scope}:${ipHash.slice(0, 24)}`;
    const now = Math.floor(Date.now() / 1000);
    const nextReset = now + options.windowSeconds;

    let row: { count: number; reset_at: number } | null = null;
    try {
      row = await db
        .prepare(
          `INSERT INTO rate_limits (bucket_key, count, reset_at)
           VALUES (?, 1, ?)
           ON CONFLICT(bucket_key) DO UPDATE SET
             count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
             reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END
           RETURNING count, reset_at`
        )
        .bind(bucketKey, nextReset, now, now, nextReset)
        .first<{ count: number; reset_at: number }>();
    } catch (err) {
      console.error('Rate limit check failed (fail-open):', err);
      await next();
      return;
    }

    const currentCount = row?.count ?? 1;
    const resetAt = row?.reset_at ?? nextReset;
    const remaining = Math.max(0, options.maxRequests - currentCount);

    c.header('X-RateLimit-Limit', String(options.maxRequests));
    c.header('X-RateLimit-Remaining', String(remaining));

    // Opportunistic cleanup of stale buckets (~5% of requests)
    if (Math.random() < 0.05) {
      const cleanup = db
        .prepare('DELETE FROM rate_limits WHERE reset_at < ?')
        .bind(now - 60)
        .run()
        .catch(() => {});
      try {
        c.executionCtx.waitUntil(cleanup);
      } catch {
        // Ignore in test environments without ExecutionContext
      }
    }

    if (currentCount > options.maxRequests) {
      const retryAfter = Math.max(1, resetAt - now);
      c.header('Retry-After', String(retryAfter));
      return c.json(
        { error: 'Muitas tentativas. Aguarde alguns instantes antes de tentar novamente.' },
        429
      );
    }

    await next();
  };
}
