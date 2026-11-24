import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnv } from '../types.ts';

/**
 * Schedules a background promise via Cloudflare ExecutionContext.waitUntil,
 * optionally awaiting it when ExecutionContext is unavailable (e.g. unit tests).
 */
export async function runInBackground(
  c: Context<AppEnv>,
  promise: Promise<unknown>,
  opts?: { awaitFallback?: boolean }
): Promise<void> {
  const safePromise = promise.catch((err) => {
    console.error('Background task failed:', err);
  });

  try {
    c.executionCtx.waitUntil(safePromise);
  } catch {
    if (opts?.awaitFallback) {
      await safePromise;
    }
  }
}

/**
 * Returns a standardized JSON error response with optional extra fields.
 */
export function apiError(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  error: string,
  extra?: Record<string, unknown>
) {
  return c.json({ error, ...extra }, status);
}
