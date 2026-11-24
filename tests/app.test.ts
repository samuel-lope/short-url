import { describe, expect, it } from 'vitest';
import { createApp } from '../src/worker/index.ts';
import { encodeId, decodeCode } from '../src/worker/services/hashids.ts';
import { validateCustomSlug, validateHttpUrl } from '../src/worker/services/validation.ts';
import { hashPassword, verifyPassword } from '../src/worker/services/crypto.ts';
import {
  resolveAnonymousFeatures,
  resolveProfileFeatures,
  resolveUserFeatures,
} from '../src/worker/services/entitlements.ts';
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
  it('validates http/https URLs, rejects unsafe schemes, and blocks self-redirect loops', () => {
    expect(validateHttpUrl('https://example.com/teste').valid).toBe(true);
    expect(validateHttpUrl('https://sa.api.br/teste').valid).toBe(false);
    expect(validateHttpUrl('https://ue.ia.br/abc').valid).toBe(false);
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

  it('restores anonymous features on logout, enforces security headers & CSRF, and rate-limits auth', async () => {
    const db = createTestD1();
    const env = createTestEnv(db);
    const app = createApp();

    const reg = await app.fetch(
      new Request('https://sa.api.br/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
        body: JSON.stringify({ name: 'Admin', email: 'admin@sa.api.br', password: 'Password123!' }),
      }),
      env
    );
    expect(reg.headers.get('x-content-type-options')).toBe('nosniff');
    expect(reg.headers.get('x-frame-options')).toBe('DENY');
    expect(reg.headers.get('content-security-policy')).toContain("default-src 'self'");
    const cookie = extractSessionCookie(reg);

    // CSRF guard blocks foreign Origin on mutation
    const csrfRes = await app.fetch(
      new Request('https://sa.api.br/api/auth/logout', {
        method: 'POST',
        headers: { Origin: 'https://evil.example.com', Cookie: cookie },
      }),
      env
    );
    expect(csrfRes.status).toBe(403);

    // Logout restores anonymous features
    const logoutRes = await app.fetch(
      new Request('https://sa.api.br/api/auth/logout', {
        method: 'POST',
        headers: { Origin: 'https://sa.api.br', Cookie: cookie },
      }),
      env
    );
    expect(logoutRes.status).toBe(200);
    const logoutBody = (await logoutRes.json()) as { features: Record<string, { enabled: boolean }> };
    expect(logoutBody.features['links.create'].enabled).toBe(true);
    expect(logoutBody.features['links.manage_own'].enabled).toBe(false);

    // Rate limit kicks in after 10 auth requests from same IP (reg was #1)
    let lastStatus = 200;
    for (let i = 0; i < 10; i++) {
      const r = await app.fetch(
        new Request('https://sa.api.br/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
          body: JSON.stringify({ email: 'admin@sa.api.br', password: 'wrong' }),
        }),
        env
      );
      lastStatus = r.status;
    }
    expect(lastStatus).toBe(429);
  });

  it('prevents last-admin lockout, supports atomic user permissions, pagination, and safe JSON parsing', async () => {
    const db = createTestD1();
    const env = createTestEnv(db);
    const app = createApp();

    const adminReg = await app.fetch(
      new Request('https://sa.api.br/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Sole Admin', email: 'sole@sa.api.br', password: 'Password123!' }),
      }),
      env
    );
    const adminBody = (await adminReg.json()) as { user: { id: number } };
    const adminCookie = extractSessionCookie(adminReg);

    // Cannot demote the only active admin
    const demoteRes = await app.fetch(
      new Request(`https://sa.api.br/api/admin/users/${adminBody.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ planId: 1 }),
      }),
      env
    );
    expect(demoteRes.status).toBe(400);

    // Register second user & update permissions atomically
    const userReg = await app.fetch(
      new Request('https://sa.api.br/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Member', email: 'member@sa.api.br', password: 'Password123!' }),
      }),
      env
    );
    const userBody = (await userReg.json()) as { user: { id: number } };
    const userCookie = extractSessionCookie(userReg);

    const atomicRes = await app.fetch(
      new Request(`https://sa.api.br/api/admin/users/${userBody.user.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          planId: 1,
          overrides: [{ featureKey: 'analytics.detailed', enabled: true }],
        }),
      }),
      env
    );
    expect(atomicRes.status).toBe(200);

    const meRes = await app.fetch(
      new Request('https://sa.api.br/api/auth/me', { headers: { Cookie: userCookie } }),
      env
    );
    const meJson = (await meRes.json()) as { features: Record<string, { enabled: boolean }> };
    expect(meJson.features['analytics.detailed'].enabled).toBe(true);

    // Create 2 links and test search + pagination
    await app.fetch(
      new Request('https://sa.api.br/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ url: 'https://alpha.example.com', title: 'Alpha', mode: 'static' }),
      }),
      env
    );
    const dynRes = await app.fetch(
      new Request('https://sa.api.br/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ url: 'https://beta.example.com', title: 'Beta', mode: 'dynamic' }),
      }),
      env
    );
    const dyn = (await dynRes.json()) as { id: number };

    // Corrupt rule_config JSON directly in DB and ensure GET /api/links/:id does not crash
    await db
      .prepare('UPDATE link_targets SET rule_config = ? WHERE link_id = ?')
      .bind('{invalid-json', dyn.id)
      .run();
    const detailRes = await app.fetch(
      new Request(`https://sa.api.br/api/links/${dyn.id}`, { headers: { Cookie: adminCookie } }),
      env
    );
    expect(detailRes.status).toBe(200);

    const searchRes = await app.fetch(
      new Request('https://sa.api.br/api/links?q=Beta&mode=dynamic&page=1&limit=1', {
        headers: { Cookie: adminCookie },
      }),
      env
    );
    expect(searchRes.status).toBe(200);
    const searchJson = (await searchRes.json()) as {
      links: Array<{ title: string }>;
      pagination: { total: number; totalPages: number };
    };
    expect(searchJson.links).toHaveLength(1);
    expect(searchJson.links[0].title).toBe('Beta');
    expect(searchJson.pagination.total).toBe(1);
  });

  it('resolves anonymous, profile, and user features in a single query with full_access and override precedence', async () => {
    const db = createTestD1();
    let prepareCount = 0;
    const countedDb = {
      prepare(sql: string) {
        prepareCount += 1;
        return db.prepare(sql);
      },
    } as unknown as D1Database;

    // 1. resolveAnonymousFeatures with seeded 'anonymous' plan (1 SQL query)
    prepareCount = 0;
    const anonFeatures = await resolveAnonymousFeatures(countedDb);
    expect(prepareCount).toBe(1);
    expect(anonFeatures['links.create']).toEqual({ enabled: true, limit: null, source: 'plan' });
    expect(anonFeatures['links.manage_own']).toEqual({ enabled: false, limit: null, source: 'plan' });

    // 2. resolveProfileFeatures on registered (plan 1) vs full_access admin (plan 3), plus default fallback
    await db
      .prepare(
        `INSERT INTO features (key, name, description, category, default_enabled)
         VALUES ('custom.beta', 'Beta', '', 'custom', 1),
                ('custom.off', 'Off', '', 'custom', 0)`
      )
      .run();

    prepareCount = 0;
    const regFeatures = await resolveProfileFeatures(countedDb, 1);
    expect(prepareCount).toBe(1);
    expect(regFeatures['links.create']).toEqual({ enabled: true, limit: 50, source: 'plan' });
    expect(regFeatures['links.custom_slug']).toEqual({ enabled: false, limit: null, source: 'plan' });
    expect(regFeatures['custom.beta']).toEqual({ enabled: true, limit: null, source: 'default' });
    expect(regFeatures['custom.off']).toEqual({ enabled: false, limit: null, source: 'default' });

    prepareCount = 0;
    const adminProfileFeatures = await resolveProfileFeatures(countedDb, 3);
    expect(prepareCount).toBe(1);
    expect(adminProfileFeatures['links.custom_slug']).toEqual({
      enabled: true,
      limit: null,
      source: 'full_access',
    });
    expect(adminProfileFeatures['custom.off']).toEqual({
      enabled: true,
      limit: null,
      source: 'full_access',
    });

    // 3. resolveUserFeatures: override > full_access > plan > default, ignoring expired overrides
    await db
      .prepare(
        `INSERT INTO users (id, email, password_hash, name, role, plan_id)
         VALUES (1, 'reg@sa.api.br', 'hash', 'Reg', 'user', 1),
                (2, 'adm@sa.api.br', 'hash', 'Adm', 'admin', 3)`
      )
      .run();

    const now = Math.floor(Date.now() / 1000);
    await db
      .prepare(
        `INSERT INTO user_feature_overrides (user_id, feature_key, enabled, limit_value, expires_at)
         VALUES
           (1, 'links.custom_slug', 1, 15, ?),
           (1, 'links.create', 1, NULL, NULL),
           (1, 'url.dynamic_switch', 0, NULL, NULL),
           (1, 'analytics.detailed', 1, NULL, ?),
           (2, 'qr.dynamic', 0, NULL, NULL),
           (2, 'links.custom_slug', 0, NULL, ?)`
      )
      .bind(now + 3600, now - 60, now - 10)
      .run();

    prepareCount = 0;
    const userFeatures = await resolveUserFeatures(countedDb, 1, 1);
    expect(prepareCount).toBe(1);
    expect(userFeatures['links.custom_slug']).toEqual({ enabled: true, limit: 15, source: 'override' });
    expect(userFeatures['links.create']).toEqual({ enabled: true, limit: 50, source: 'override' });
    expect(userFeatures['url.dynamic_switch']).toEqual({ enabled: false, limit: 5, source: 'override' });
    expect(userFeatures['analytics.detailed']).toEqual({ enabled: false, limit: null, source: 'plan' });
    expect(userFeatures['custom.beta']).toEqual({ enabled: true, limit: null, source: 'default' });

    prepareCount = 0;
    const adminUserFeatures = await resolveUserFeatures(countedDb, 2, 3);
    expect(prepareCount).toBe(1);
    expect(adminUserFeatures['qr.dynamic']).toEqual({ enabled: false, limit: null, source: 'override' });
    expect(adminUserFeatures['links.custom_slug']).toEqual({
      enabled: true,
      limit: null,
      source: 'full_access',
    });

    // 4. resolveAnonymousFeatures fallback when no 'anonymous' plan exists (1 SQL query)
    await db.prepare("DELETE FROM plans WHERE slug = 'anonymous'").run();
    prepareCount = 0;
    const fallbackAnon = await resolveAnonymousFeatures(countedDb);
    expect(prepareCount).toBe(1);
    expect(fallbackAnon).toEqual({
      'links.create': { enabled: true, limit: null, source: 'default' },
    });
  });

  it('deactivates and reactivates a user via PUT /api/admin/users/:userId/permissions', async () => {
    const db = createTestD1();
    const env = createTestEnv(db);
    const app = createApp();

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

    const userReg = await app.fetch(
      new Request('https://sa.api.br/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Member', email: 'member@sa.api.br', password: 'Password123!' }),
      }),
      env
    );
    expect(userReg.status).toBe(201);
    const userBody = (await userReg.json()) as { user: { id: number } };
    const userCookie = extractSessionCookie(userReg);

    // Deactivate user via atomic permissions endpoint
    const deactivateRes = await app.fetch(
      new Request(`https://sa.api.br/api/admin/users/${userBody.user.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          planId: 1,
          isActive: false,
          overrides: [],
        }),
      }),
      env
    );
    expect(deactivateRes.status).toBe(200);

    // Existing session is no longer authenticated
    const meWhileInactive = await app.fetch(
      new Request('https://sa.api.br/api/auth/me', { headers: { Cookie: userCookie } }),
      env
    );
    expect(meWhileInactive.status).toBe(200);
    const meInactiveJson = (await meWhileInactive.json()) as { user: unknown };
    expect(meInactiveJson.user).toBeNull();

    // Login is blocked with 403
    const blockedLogin = await app.fetch(
      new Request('https://sa.api.br/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'member@sa.api.br', password: 'Password123!' }),
      }),
      env
    );
    expect(blockedLogin.status).toBe(403);
    const blockedJson = (await blockedLogin.json()) as { error: string };
    expect(blockedJson.error).toBe('Conta desativada.');

    // Reactivate user
    const reactivateRes = await app.fetch(
      new Request(`https://sa.api.br/api/admin/users/${userBody.user.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          planId: 1,
          isActive: true,
          overrides: [],
        }),
      }),
      env
    );
    expect(reactivateRes.status).toBe(200);

    // Login succeeds again
    const reactivatedLogin = await app.fetch(
      new Request('https://sa.api.br/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'member@sa.api.br', password: 'Password123!' }),
      }),
      env
    );
    expect(reactivatedLogin.status).toBe(200);
    const loginJson = (await reactivatedLogin.json()) as { user: { email: string } };
    expect(loginJson.user.email).toBe('member@sa.api.br');
  });
});
