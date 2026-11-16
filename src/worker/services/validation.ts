import { RESERVED_SLUGS } from '../../shared/contracts.ts';

export function validateHttpUrl(rawUrl: string): { valid: true; url: string } | { valid: false; error: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) {
    return { valid: false, error: 'URL inválida ou muito longa.' };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Apenas URLs http:// ou https:// são permitidas.' };
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
