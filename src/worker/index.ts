import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from './types.ts';
import { RESERVED_SLUGS } from '../shared/contracts.ts';
import { corsMiddleware } from './middleware/cors.ts';
import { sessionMiddleware } from './middleware/auth.ts';
import { hasFeature } from './services/entitlements.ts';
import { authRoutes } from './routes/auth.ts';
import { createShortLink, linkRoutes } from './routes/links.ts';
import { qrRoutes } from './routes/qr.ts';
import { analyticsRoutes } from './routes/analytics.ts';
import { adminRoutes } from './routes/admin.ts';
import { handleShortRedirect } from './routes/redirect.ts';

const publicShortenSchema = z.object({
  url: z.string().min(1, 'URL é obrigatória.'),
  title: z.string().trim().max(120).optional().nullable(),
});

export function createApp() {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    console.error('Unhandled worker error:', err);
    return c.json({ error: 'Erro interno do servidor.' }, 500);
  });

  app.use('/api/*', corsMiddleware, sessionMiddleware);
  app.use('/v1/*', corsMiddleware, sessionMiddleware);

  app.get('/api/health', (c) => c.json({ ok: true }));

  const handlePublicShorten = async (c: Context<AppEnv>) => {
    if (!hasFeature(c.get('features'), 'links.create')) {
      return c.json({ error: 'Criação de links não liberada para este perfil.', code: 'FEATURE_LOCKED', feature: 'links.create' }, 403);
    }

    const parsed = publicShortenSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'URL é obrigatória.' }, 400);
    }

    const user = c.get('user');
    const origin = new URL(c.req.url).origin;
    const result = await createShortLink({
      db: c.env.DB,
      hashSecret: c.env.HASH_SECRET,
      origin,
      userId: user?.id ?? null,
      url: parsed.data.url,
      title: parsed.data.title,
      mode: 'static',
    });

    return c.json(result.body, result.status);
  };

  app.post('/api/public/shorten', handlePublicShorten);
  app.post('/v1/short', handlePublicShorten);

  app.route('/api/auth', authRoutes);
  app.route('/api/links', linkRoutes);
  app.route('/api/qr', qrRoutes);
  app.route('/api/analytics', analyticsRoutes);
  app.route('/api/admin', adminRoutes);

  // QR Code dedicated redirect path (tracks source = 'qr')
  app.get('/q/:code', async (c) => {
    const code = c.req.param('code');
    return handleShortRedirect(c, code, 'qr');
  });

  // Static assets & SPA shell routes
  const serveSpa = async (c: { env: AppEnv['Bindings']; req: { raw: Request; url: string }; text: (t: string, s?: number) => Response }) => {
    if (c.env.ASSETS) {
      return c.env.ASSETS.fetch(c.req.raw);
    }
    return c.text('SHORT API - Ativo', 200);
  };

  app.get('/', serveSpa);
  app.get('/login', serveSpa);
  app.get('/register', serveSpa);
  app.get('/app', serveSpa);
  app.get('/app/*', serveSpa);
  app.get('/admin', serveSpa);
  app.get('/admin/*', serveSpa);
  app.get('/assets/*', serveSpa);
  app.get('/favicon.ico', serveSpa);

  // Short URL resolution (must remain after explicit SPA/API routes)
  app.get('/:code', async (c) => {
    const code = c.req.param('code');
    if (RESERVED_SLUGS.has(code.toLowerCase()) || code.includes('.')) {
      return serveSpa(c);
    }
    return handleShortRedirect(c, code, 'link');
  });

  return app;
}

const app = createApp();
export default app;
