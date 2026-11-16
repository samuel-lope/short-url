import { describe, expect, it } from 'vitest';
import { createApp } from '../src/worker/index.ts';
import { encodeId, decodeCode } from '../src/worker/services/hashids.ts';
import { validateCustomSlug, validateHttpUrl } from '../src/worker/services/validation.ts';
import { hashPassword, verifyPassword } from '../src/worker/services/crypto.ts';
import { resolveDestination } from '../src/worker/services/routerEngine.ts';
import { createTestD1 } from './helpers/d1Mock.ts';

const TEST_SECRET = 'test-hash-secret';

function createTestEnv(db: D1Database) {
  return {
    DB: db,
    HASH_SECRET: TEST_SECRET,
    IP_HASH_SALT: 'test-ip-salt',
  };
}

function extractSessionCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/sa_session=([^;]+)/);
  return match ? `sa_session=${match[1]}` : '';
}

describe('Core services', () => {
  it('validates http/https URLs and rejects unsafe schemes', () => {
    expect(validateHttpUrl('https://sa.api.br/teste').valid).toBe(true);
    expect(validateHttpUrl('javascript:alert(1)').valid).toBe(false);
    expect(validateHttpUrl('data:text/html,hi').valid).toBe(false);
  });

  it('rejects reserved slugs', () => {
    expect(validateCustomSlug('api').valid).toBe(false);
    expect(validateCustomSlug('login').valid).toBe(false);
    expect(validateCustomSlug('promo-2026').valid).toBe(true);
  });

  it('keeps Hashids backward compatibility', () => {
    const code = encodeId(42, TEST_SECRET);
    expect(code.length).toBeGreaterThanOrEqual(4);
    expect(decodeCode(code, TEST_SECRET)).toBe(42);
  });

  it('hashes and verifies passwords with PBKDF2', async () => {
    const hash = await hashPassword('SenhaForte123!');
    expect(await verifyPassword('SenhaForte123!', hash)).toBe(true);
    expect(await verifyPassword('Errada', hash)).toBe(false);
  });

  it('evaluates conditional rules by priority and falls back to active_target_id', () => {
    const link = {
      id: 1,
      longURL: 'https://fallback.example.com',
      shortURL: 'abc',
      mode: 'dynamic' as const,
      active_target_id: 3,
      is_active: 1,
    };
    const targets = [
      {
        id: 1,
        link_id: 1,
        label: 'iOS',
        target_url: 'https://ios.example.com',
        priority: 1,
        rule_type: 'os' as const,
        rule_config: JSON.stringify({ os: ['iOS'] }),
        is_active: 1,
      },
      {
        id: 2,
        link_id: 1,
        label: 'Brasil',
        target_url: 'https://br.example.com',
        priority: 2,
        rule_type: 'geo' as const,
        rule_config: JSON.stringify({ countries: ['BR'] }),
        is_active: 1,
      },
      {
        id: 3,
        link_id: 1,
        label: 'Manual Ativo',
        target_url: 'https://manual.example.com',
        priority: 10,
        rule_type: 'manual' as const,
        rule_config: null,
        is_active: 1,
      },
    ];

    expect(
      resolveDestination(link, targets, { deviceType: 'mobile', os: 'iOS', country: 'BR', nowEpoch: 1000 })
    ).toEqual({ targetUrl: 'https://ios.example.com', targetId: 1 });

    expect(
      resolveDestination(link, targets, { deviceType: 'desktop', os: 'Windows', country: 'BR', nowEpoch: 1000 })
    ).toEqual({ targetUrl: 'https://br.example.com', targetId: 2 });

    expect(
      resolveDestination(link, targets, { deviceType: 'desktop', os: 'Windows', country: 'US', nowEpoch: 1000 })
    ).toEqual({ targetUrl: 'https://manual.example.com', targetId: 3 });
  });
});

describe('Full-stack API & Redirects', () => {
  it('supports anonymous shortening, 302 no-cache redirect, and usage tracking', async () => {
    const db = createTestD1();
    const env = createTestEnv(db);
    const app = createApp();

    // Legacy row without user_id
    const legacyCode = encodeId(1, TEST_SECRET);
    await db
      .prepare('INSERT INTO links (id, longURL, shortURL, titleURL) VALUES (1, ?, ?, ?)')
      .bind('https://legacy.example.com', legacyCode, 'Legacy')
      .run();

    const legacyRes = await app.fetch(new Request(`https://sa.api.br/${legacyCode}`), env);
    expect(legacyRes.status).toBe(302);
    expect(legacyRes.headers.get('location')).toBe('https://legacy.example.com');
    expect(legacyRes.headers.get('cache-control')).toContain('no-store');

    // Anonymous shortener
    const createRes = await app.fetch(
      new Request('https://sa.api.br/v1/short', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://destino.example.com/abc', title: 'Anon' }),
      }),
      env
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { short_code: string };

    const redirRes = await app.fetch(
      new Request(`https://sa.api.br/${created.short_code}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
      }),
      env
    );
    expect(redirRes.status).toBe(302);
    expect(redirRes.headers.get('location')).toBe('https://destino.example.com/abc');

    const clicks = await db
      .prepare('SELECT COUNT(*) AS c FROM click_events WHERE link_id = 2')
      .first<{ c: number }>();
    expect(clicks?.c).toBe(1);
  });

  it('enforces per-user feature gating and releases features via admin override', async () => {
    const db = createTestD1();
    const env = createTestEnv(db);
    const app = createApp();

    // 1st user -> auto admin + enterprise
    const adminReg = await app.fetch(
      new Request('https://sa.api.br/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Admin', email: 'admin@sa.api.br', password: 'Password123!' }),
      }),
      env
    );
    expect(adminReg.status).toBe(201);
    const adminCookie = extractSessionCookie(adminReg);

    // 2nd user -> regular free plan
    const userReg = await app.fetch(
      new Request('https://sa.api.br/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'User', email: 'user@sa.api.br', password: 'Password123!' }),
      }),
      env
    );
    expect(userReg.status).toBe(201);
    const userBody = (await userReg.json()) as { user: { id: number }; features: Record<string, { enabled: boolean }> };
    expect(userBody.features['links.custom_slug'].enabled).toBe(false);
    expect(userBody.features['url.dynamic_switch'].enabled).toBe(true);
    const userCookie = extractSessionCookie(userReg);

    // Free user blocked from customSlug
    const lockedSlugRes = await app.fetch(
      new Request('https://sa.api.br/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userCookie },
        body: JSON.stringify({ url: 'https://example.com', customSlug: 'meu-slug' }),
      }),
      env
    );
    expect(lockedSlugRes.status).toBe(403);

    // Admin grants 'links.custom_slug' override to user
    const grantRes = await app.fetch(
      new Request(`https://sa.api.br/api/admin/users/${userBody.user.id}/features/links.custom_slug`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ enabled: true }),
      }),
      env
    );
    expect(grantRes.status).toBe(200);

    // Now user can create link with customSlug!
    const unlockedRes = await app.fetch(
      new Request('https://sa.api.br/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: userCookie },
        body: JSON.stringify({ url: 'https://example.com/v1', customSlug: 'meu-slug', mode: 'dynamic' }),
      }),
      env
    );
    expect(unlockedRes.status).toBe(201);
  });

  it('switches dynamic URL targets instantly and tracks dynamic QR scans', async () => {
    const db = createTestD1();
    const env = createTestEnv(db);
    const app = createApp();

    const reg = await app.fetch(
      new Request('https://sa.api.br/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Creator', email: 'creator@sa.api.br', password: 'Password123!' }),
      }),
      env
    );
    const cookie = extractSessionCookie(reg);

    // Create dynamic link
    const linkRes = await app.fetch(
      new Request('https://sa.api.br/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ url: 'https://site-a.example.com', mode: 'dynamic', customSlug: 'oferta' }),
      }),
      env
    );
    expect(linkRes.status).toBe(201);
    const linkData = (await linkRes.json()) as { id: number; short_code: string };

    // Add second target and set active
    const targetRes = await app.fetch(
      new Request(`https://sa.api.br/api/links/${linkData.id}/targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          label: 'Site B',
          targetUrl: 'https://site-b.example.com',
          setAsActive: true,
        }),
      }),
      env
    );
    expect(targetRes.status).toBe(201);

    // Redirect now points to Site B
    const redirB = await app.fetch(new Request('https://sa.api.br/oferta'), env);
    expect(redirB.status).toBe(302);
    expect(redirB.headers.get('location')).toBe('https://site-b.example.com/');

    // Create Dynamic QR
    const qrPut = await app.fetch(
      new Request(`https://sa.api.br/api/qr/${linkData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ style: { fgColor: '#111111', bgColor: '#ffffff' } }),
      }),
      env
    );
    expect(qrPut.status).toBe(201);

    // Scan QR via /q/:code
    const qrScan = await app.fetch(new Request('https://sa.api.br/q/oferta'), env);
    expect(qrScan.status).toBe(302);
    expect(qrScan.headers.get('location')).toBe('https://site-b.example.com/');

    const analyticsRes = await app.fetch(
      new Request(`https://sa.api.br/api/analytics/links/${linkData.id}`, {
        headers: { Cookie: cookie },
      }),
      env
    );
    expect(analyticsRes.status).toBe(200);
    const analytics = (await analyticsRes.json()) as {
      totals: { qrScans: number; linkClicks: number };
    };
    expect(analytics.totals.qrScans).toBe(1);
    expect(analytics.totals.linkClicks).toBe(1);
  });

  it('provides pre-defined Admin, Anonymous, and Registered profiles and lets Admin create custom access profiles', async () => {
    const db = createTestD1();
    const env = createTestEnv(db);
    const app = createApp();

    // Anonymous profile resolved when unauthenticated
    const anonMe = await app.fetch(new Request('https://sa.api.br/api/auth/me'), env);
    expect(anonMe.status).toBe(200);
    const anonBody = (await anonMe.json()) as {
      user: null;
      features: Record<string, { enabled: boolean }>;
    };
    expect(anonBody.user).toBeNull();
    expect(anonBody.features['links.create'].enabled).toBe(true);
    expect(anonBody.features['links.manage_own'].enabled).toBe(false);
    expect(anonBody.features['url.dynamic_switch'].enabled).toBe(false);

    // 1st user -> Admin (full access)
    const adminReg = await app.fetch(
      new Request('https://sa.api.br/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Admin', email: 'admin@sa.api.br', password: 'Password123!' }),
      }),
      env
    );
    const adminBody = (await adminReg.json()) as {
      user: { plan: { slug: string; hasFullAccess: boolean } };
      features: Record<string, { enabled: boolean }>;
    };
    expect(adminBody.user.plan.slug).toBe('admin');
    expect(adminBody.user.plan.hasFullAccess).toBe(true);
    expect(adminBody.features['admin.profiles'].enabled).toBe(true);
    const adminCookie = extractSessionCookie(adminReg);

    // 2nd user -> Usuário Registrado
    const userReg = await app.fetch(
      new Request('https://sa.api.br/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'User', email: 'reg@sa.api.br', password: 'Password123!' }),
      }),
      env
    );
    const userBody = (await userReg.json()) as {
      user: { id: number; plan: { slug: string } };
      features: Record<string, { enabled: boolean }>;
    };
    expect(userBody.user.plan.slug).toBe('registered');
    expect(userBody.features['links.manage_own'].enabled).toBe(true);
    const userCookie = extractSessionCookie(userReg);

    // Admin creates a new custom access profile with customSlug enabled
    const createProfileRes = await app.fetch(
      new Request('https://sa.api.br/api/admin/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          name: 'Parceiro VIP',
          description: 'Acesso com slug personalizado',
          featureKeys: ['links.create', 'links.manage_own', 'links.custom_slug'],
        }),
      }),
      env
    );
    expect(createProfileRes.status).toBe(201);
    const createdProfile = (await createProfileRes.json()) as { id: number };

    // Assign custom profile to 2nd user
    const assignRes = await app.fetch(
      new Request(`https://sa.api.br/api/admin/users/${userBody.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ planId: createdProfile.id }),
      }),
      env
    );
    expect(assignRes.status).toBe(200);

    // 2nd user now inherits links.custom_slug from the custom profile
    const meAfter = await app.fetch(
      new Request('https://sa.api.br/api/auth/me', { headers: { Cookie: userCookie } }),
      env
    );
    const meAfterBody = (await meAfter.json()) as {
      user: { plan: { name: string } };
      features: Record<string, { enabled: boolean }>;
    };
    expect(meAfterBody.user.plan.name).toBe('Parceiro VIP');
    expect(meAfterBody.features['links.custom_slug'].enabled).toBe(true);
  });
});
