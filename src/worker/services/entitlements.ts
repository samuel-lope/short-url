import type { FeatureMap } from '../../shared/contracts.ts';

interface FeatureResolutionRow {
  key: string;
  default_enabled: number;
  plan_enabled: number | null;
  plan_limit: number | null;
  override_enabled: number | null;
  override_limit: number | null;
}

export async function resolveProfileFeatures(
  db: D1Database,
  planId: number
): Promise<FeatureMap> {
  const profile = await db
    .prepare('SELECT has_full_access FROM plans WHERE id = ?')
    .bind(planId)
    .first<{ has_full_access: number }>();

  const { results } = await db
    .prepare(
      `SELECT
        f.key AS key,
        f.default_enabled AS default_enabled,
        pf.enabled AS plan_enabled,
        pf.limit_value AS plan_limit
      FROM features f
      LEFT JOIN plan_features pf
        ON pf.feature_key = f.key AND pf.plan_id = ?`
    )
    .bind(planId)
    .all<Omit<FeatureResolutionRow, 'override_enabled' | 'override_limit'>>();

  const features: FeatureMap = {};
  const fullAccess = profile?.has_full_access === 1;

  for (const row of results) {
    if (fullAccess) {
      features[row.key] = { enabled: true, limit: null, source: 'full_access' };
    } else if (row.plan_enabled !== null) {
      features[row.key] = {
        enabled: row.plan_enabled === 1,
        limit: row.plan_limit ?? null,
        source: 'plan',
      };
    } else {
      features[row.key] = {
        enabled: row.default_enabled === 1,
        limit: null,
        source: 'default',
      };
    }
  }
  return features;
}

export async function resolveAnonymousFeatures(db: D1Database): Promise<FeatureMap> {
  const anon = await db
    .prepare("SELECT id FROM plans WHERE slug = 'anonymous' LIMIT 1")
    .first<{ id: number }>();
  if (!anon) {
    return { 'links.create': { enabled: true, limit: null, source: 'default' } };
  }
  return resolveProfileFeatures(db, anon.id);
}

export async function resolveUserFeatures(
  db: D1Database,
  userId: number,
  planId: number
): Promise<FeatureMap> {
  const profile = await db
    .prepare('SELECT has_full_access FROM plans WHERE id = ?')
    .bind(planId)
    .first<{ has_full_access: number }>();

  const now = Math.floor(Date.now() / 1000);
  const { results } = await db
    .prepare(
      `SELECT
        f.key AS key,
        f.default_enabled AS default_enabled,
        pf.enabled AS plan_enabled,
        pf.limit_value AS plan_limit,
        ufo.enabled AS override_enabled,
        ufo.limit_value AS override_limit
      FROM features f
      LEFT JOIN plan_features pf
        ON pf.feature_key = f.key AND pf.plan_id = ?
      LEFT JOIN user_feature_overrides ufo
        ON ufo.feature_key = f.key
       AND ufo.user_id = ?
       AND (ufo.expires_at IS NULL OR ufo.expires_at > ?)`
    )
    .bind(planId, userId, now)
    .all<FeatureResolutionRow>();

  const features: FeatureMap = {};
  const fullAccess = profile?.has_full_access === 1;

  for (const row of results) {
    if (row.override_enabled !== null) {
      features[row.key] = {
        enabled: row.override_enabled === 1,
        limit: row.override_limit ?? row.plan_limit ?? null,
        source: 'override',
      };
    } else if (fullAccess) {
      features[row.key] = {
        enabled: true,
        limit: null,
        source: 'full_access',
      };
    } else if (row.plan_enabled !== null) {
      features[row.key] = {
        enabled: row.plan_enabled === 1,
        limit: row.plan_limit ?? null,
        source: 'plan',
      };
    } else {
      features[row.key] = {
        enabled: row.default_enabled === 1,
        limit: null,
        source: 'default',
      };
    }
  }
  return features;
}

export function hasFeature(features: FeatureMap, key: string): boolean {
  return Boolean(features[key]?.enabled);
}

export function getFeatureLimit(features: FeatureMap, key: string): number | null {
  return features[key]?.limit ?? null;
}
