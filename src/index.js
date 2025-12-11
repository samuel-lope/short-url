import { encodeId, decodeCode } from './utils';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.slice(1);

    // --- Endpoint 1: Encurtamento (POST /) ---
    if (request.method === 'POST' && path === '') {
      return await handleShorten(request, env);
    }

    // --- Endpoint 2: Redirecionamento (GET /[código]) ---
    if (request.method === 'GET' && path.length > 0) {
      return await handleRedirect(path, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};

/**
 * Lógica de Encurtamento (Com Persistência do shortURL)
 */
async function handleShorten(request, env) {
  try {
    const body = await request.json();
    
    if (!body.url) {
      return new Response('URL is required', { status: 400 });
    }

    // 1. Primeiro Insert: Apenas a URL longa para garantir o ID
    // O D1 suporta "RETURNING id" para nos devolver o ID gerado imediatamente.
    const inserted = await env.DB.prepare(
      'INSERT INTO links (longURL, titleURL) VALUES (?, ?) RETURNING id'
    )
    .bind(body.url, body.title || null)
    .first();

    if (!inserted) {
      throw new Error('Falha ao inserir no banco de dados');
    }

    const newId = inserted.id;

    // 2. Cálculo do Hashids (Baseado no ID recém criado)
    const shortCode = encodeId(newId, env.HASH_SECRET);

    // 3. Update Atômico: Salvar o código gerado no mesmo registro
    // Usamos ctx.waitUntil? Não, pois precisamos confirmar que salvou antes de responder ao usuário.
    await env.DB.prepare(
      'UPDATE links SET shortURL = ? WHERE id = ?'
    )
    .bind(shortCode, newId)
    .run();

    const shortUrl = `https://sa.api.br/${shortCode}`;

    return new Response(JSON.stringify({
      shortCode: shortCode,
      shortUrl: shortUrl,
      originalUrl: body.url
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    // Log do erro real para o Cloudflare (console interno)
    console.error(err);
    return new Response(`Server Error: ${err.message}`, { status: 500 });
  }
}

/**
 * Lógica de Redirecionamento (Mantida Rápida via ID)
 */
async function handleRedirect(code, env) {
  // Mesmo persistindo o shortURL, continuamos decodificando matematicamente
  // para buscar pelo ID numérico, que é mais rápido no SQLite.
  const linkId = decodeCode(code, env.HASH_SECRET);

  if (linkId === null) {
    return new Response('Link invalido', { status: 404 });
  }

  // Busca ultra-rápida pela Primary Key
  const result = await env.DB.prepare(
    'SELECT longURL FROM links WHERE id = ?'
  )
  .bind(linkId)
  .first();

  // Opcional: Validação extra de segurança
  // Se quiser ter 100% de certeza que o código da URL bate com o do banco:
  // 'SELECT longURL FROM links WHERE id = ? AND shortURL = ?'

  if (!result) {
    return new Response('Link nao encontrado', { status: 404 });
  }

  return new Response(null, {
    status: 301,
    headers: {
      'Location': result.longURL,
      // Boas práticas de cache para redirects permanentes
      'Cache-Control': 'public, max-age=86400' 
    }
  });
}

