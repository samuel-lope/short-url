import { cors } from 'hono/cors';

const ALLOWED_ORIGINS = new Set([
  'https://sa.api.br',
  'https://ue.ia.br',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8787',
]);

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return 'https://sa.api.br';
    return ALLOWED_ORIGINS.has(origin) ? origin : '';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
});
