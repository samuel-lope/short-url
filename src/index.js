import { encodeId, decodeCode } from './utils';

// ============================================================================
//  POLÍTICA DE CORS (Cross-Origin Resource Sharing)
// ============================================================================
const ALLOWED_ORIGINS = [
  'https://sa.api.br',
  'https://ue.ia.br',
  'http://127.0.0.1:5500',
  'http://localhost:8787'
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };
  }
  // Se não tiver Origin (server-to-server) ou não estiver na lista, retorna vazio ou *
  // Para simplificar o debug, vamos permitir * se não estiver na lista, 
  // mas idealmente mantenha restrito em produção.
  return {
      'Access-Control-Allow-Origin': origin || '*', 
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function handleOptions(request) {
  const headers = getCorsHeaders(request);
  return new Response(null, { headers });
}

// ============================================================================
//  WORKER PRINCIPAL
// ============================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. Tratamento de CORS Preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // 2. ROTA DE ENCURTAMENTO (POST /v1/short)
    if (request.method === 'POST' && path === '/v1/short') {
      return await handleShorten(request, env);
    }

    // 3. ROTA DE REDIRECIONAMENTO (GET /:codigo)
    // Ignora requisições curtas ou favicon
    if (request.method === 'GET' && path.length > 1 && path !== '/favicon.ico') {
      const code = path.slice(1);
      if (!code.includes('/')) {
         return await handleRedirect(code, env);
      }
    }

    return new Response('SHORT API - Ativo', { status: 200 });
  },
};

/**
 * Lógica do Endpoint de Encurtamento (POST /v1/short)
 */
async function handleShorten(request, env) {
  const corsHeaders = getCorsHeaders(request);
  const responseHeaders = {
    'Content-Type': 'application/json',
    ...corsHeaders
  };

  try {
    // --- VERIFICAÇÕES DE AMBIENTE (DEBUG) ---
    if (!env.DB) {
      throw new Error("Binding 'DB' não encontrado. Verifique o wrangler.toml.");
    }
    if (!env.HASH_SECRET) {
      throw new Error("Variável 'HASH_SECRET' não definida. Rode 'npx wrangler secret put HASH_SECRET' ou verifique .dev.vars");
    }

    const body = await request.json();
    
    if (!body.url) {
      return new Response(JSON.stringify({ error: 'URL é obrigatória' }), { 
        status: 400, 
        headers: responseHeaders 
      });
    }

    // Validação de URL
    try { new URL(body.url); } 
    catch (_) {
       return new Response(JSON.stringify({ error: 'Formato de URL inválido' }), { 
        status: 400, 
        headers: responseHeaders 
      });
    }

    // 1. Inserir e obter ID
    // O 'RETURNING id' exige que a tabela tenha sido criada corretamente com AUTOINCREMENT
    const stmt = env.DB.prepare('INSERT INTO links (longURL, titleURL) VALUES (?, ?) RETURNING id');
    const inserted = await stmt.bind(body.url, body.title || null).first();

    if (!inserted) {
      throw new Error("Falha ao inserir no banco de dados (retorno vazio).");
    }

    const newId = inserted.id;

    // 2. Gerar código Hashids
    const shortCode = encodeId(newId, env.HASH_SECRET);

    // 3. Persistir o código
    await env.DB.prepare('UPDATE links SET shortURL = ? WHERE id = ?')
      .bind(shortCode, newId)
      .run();

    // 4. Montar URL de retorno
    // Usa o origin da requisição ou fallback para sa.api.br
    const origin = new URL(request.url).origin;
    
    return new Response(JSON.stringify({
      short_code: shortCode,
      short_url: `${origin}/${shortCode}`,
      original_url: body.url
    }), {
      status: 201,
      headers: responseHeaders
    });

  } catch (err) {
    // --- MODO DEBUG LIGADO ---
    // Retorna o erro exato para o frontend para sabermos o que corrigir
    console.error("ERRO FATAL:", err);
    
    return new Response(JSON.stringify({ 
      error: `Erro no Servidor: ${err.message}`,
      stack: err.stack 
    }), { 
      status: 500,
      headers: responseHeaders
    });
  }
}

/**
 * Lógica de Redirecionamento (GET /:code)
 */
async function handleRedirect(code, env) {
  try {
    if (!env.HASH_SECRET) throw new Error("HASH_SECRET faltando");

    const linkId = decodeCode(code, env.HASH_SECRET);

    if (linkId === null) {
      return new Response('Código inválido ou corrompido', { status: 404 });
    }

    const result = await env.DB.prepare('SELECT longURL FROM links WHERE id = ?')
      .bind(linkId)
      .first();

    if (!result) {
      return new Response('URL não encontrada no banco', { status: 404 });
    }

    return new Response(null, {
      status: 301,
      headers: { 
        'Location': result.longURL,
        'Cache-Control': 'public, max-age=86400',
        ...getCorsHeaders({ headers: { get: () => null } }) // Headers básicos
      }
    });
  } catch (err) {
     return new Response(`Erro no Redirect: ${err.message}`, { status: 500 });
  }
}

