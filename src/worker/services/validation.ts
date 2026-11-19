import { RESERVED_SLUGS } from '../../shared/contracts.ts';

const DEFAULT_SELF_HOSTS = new Set(['sa.api.br', 'ue.ia.br']);

export function validateHttpUrl(
  rawUrl: string,
  extraBlockedHosts?: Iterable<string>
): { valid: true; url: string } | { valid: false; error: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) {
    return { valid: false, error: 'URL inválida ou muito longa.' };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Apenas URLs http:// ou https:// são permitidas.' };
    }

    const host = parsed.hostname.toLowerCase();
    const blocked = new Set(DEFAULT_SELF_HOSTS);
    if (extraBlockedHosts) {
      for (const h of extraBlockedHosts) {
        if (h) blocked.add(h.toLowerCase());
      }
    }

    if (blocked.has(host)) {
      return {
        valid: false,
        error: 'Não é permitido encurtar ou redirecionar para o próprio domínio do encurtador.',
      };
    }

    return { valid: true, url: parsed.toString() };
  } catch {
    return { valid: false, error: 'Formato de URL inválido.' };
  }
}

export function validateCustomSlug(slug: string): { valid: true; slug: string } | { valid: false; error: string } {
  const normalized = slug.trim();
  if (!/^[a-zA-Z0-9_-]{3,40}$/.test(normalized)) {
    return {
      valid: false,
      error: 'Slug deve ter entre 3 e 40 caracteres (letras, números, - ou _).',
    };
  }
  if (RESERVED_SLUGS.has(normalized.toLowerCase())) {
    return { valid: false, error: 'Este slug é reservado pelo sistema.' };
  }
  return { valid: true, slug: normalized };
}

export function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function isUniqueConstraintError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /UNIQUE constraint failed/i.test(msg);
}
