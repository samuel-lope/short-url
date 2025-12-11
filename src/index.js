import { encodeId, decodeCode } from './utils';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname; // Ex: "/v1/short" ou "/k9J3zM1"

    // --- ROTA DE ENCURTAMENTO ---
    // Endpoint: POST https://sa.api.br/v1/short
    if (request.method === 'POST' && path === '/v1/short') {
      return await handleShorten(request, env);
    }

    // --- ROTA DE REDIRECIONAMENTO ---
    // Endpoint: GET https://sa.api.br/[codigo]
    // Verificamos se o path tem conteúdo e não é apenas a raiz "/"
    if (request.method === 'GET' && path.length > 1) {
      // .slice(1) remove a barra inicial "/"
      const code = path.slice(1);
      
      // Evita processar sub-pastas indesejadas (ex: /favicon.ico)
      if (code.includes('/') || code.includes('.')) {
        return new Response('Not Found', { status: 404 });
      }

      return await handleRedirect(code, env);
    }

    // Fallback para Home ou 404
    return new Response('SA.API.BR - Encurtador de URLs', { status: 200 });
  },
};

/**
 * Lógica do Endpoint de Encurtamento (POST /v1/short)
 */
async function handleShorten(request, env) {
  try {
    const body = await request.json();
    
    if (!body.url) {
      return new Response(JSON.stringify({ error: 'URL é obrigatória' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // 1. Inserir e obter ID
    const inserted = await env.DB.prepare(
      'INSERT INTO links (longURL, titleURL) VALUES (?, ?) RETURNING id'
    )
    .bind(body.url, body.title || null)
    .first();

    const newId = inserted.id;

    // 2. Gerar código Hashids
    const shortCode = encodeId(newId, env.HASH_SECRET);

    // 3. Persistir o código no campo shortURL
    await env.DB.prepare(
      'UPDATE links SET shortURL = ? WHERE id = ?'
    )
    .bind(shortCode, newId)
    .run();

    return new Response(JSON.stringify({
      short_code: shortCode,
      short_url: `https://sa.api.br/${shortCode}`,
      original_url: body.url
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erro interno' }), { status: 500 });
  }
}

/**
 * Lógica de Redirecionamento (GET /:code)
 */
async function handleRedirect(code, env) {
  const linkId = decodeCode(code, env.HASH_SECRET);

  if (linkId === null) {
    return new Response('Código inválido', { status: 404 });
  }

  const result = await env.DB.prepare('SELECT longURL FROM links WHERE id = ?')
    .bind(linkId)
    .first();

  if (!result) {
    return new Response('URL não encontrada', { status: 404 });
  }

  return new Response(null, {
    status: 301,
    headers: { 'Location': result.longURL }
  });
}

