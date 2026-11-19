import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.ts';
import { ALLOWED_ORIGINS } from './cors.ts';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://cloudflareinsights.com",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const securityHeadersMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('Content-Security-Policy', CSP_POLICY);
};

export const csrfOriginGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (MUTATING_METHODS.has(c.req.method)) {
    const origin = c.req.header('Origin');
    if (origin) {
      const reqOrigin = new URL(c.req.url).origin;
      if (origin !== reqOrigin && !ALLOWED_ORIGINS.has(origin)) {
        return c.json({ error: 'Origem não autorizada para esta operação.' }, 403);
      }
    }
  }
  await next();
};
