import type { FeatureMap } from '../../shared/contracts.ts';

interface FeatureResolutionRow {
  key: string;
  default_enabled: number;
  has_full_access: number | null;
  plan_enabled: number | null;
  plan_limit: number | null;
  override_enabled?: number | null;
  override_limit?: number | null;
}

interface AnonymousFeatureResolutionRow extends FeatureResolutionRow {
  plan_id: number | null;
}

function mapFeatureRows(rows: FeatureResolutionRow[]): FeatureMap {
  const features: FeatureMap = {};

  for (const row of rows) {
    if (row.override_enabled !== undefined && row.override_enabled !== null) {
      features[row.key] = {
        enabled: row.override_enabled === 1,
        limit: row.override_limit ?? row.plan_limit ?? null,
        source: 'override',
      };
    } else if (row.has_full_access === 1) {
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

export async function resolveProfileFeatures(
  db: D1Database,
  planId: number
): Promise<FeatureMap> {
  const { results } = await db
    .prepare(
      `SELECT
        f.key AS key,
        f.default_enabled AS default_enabled,
        p.has_full_access AS has_full_access,
        pf.enabled AS plan_enabled,
        pf.limit_value AS plan_limit
      FROM features f
      LEFT JOIN plans p
        ON p.id = ?
      LEFT JOIN plan_features pf
        ON pf.feature_key = f.key AND pf.plan_id = p.id`
    )
    .bind(planId)
    .all<FeatureResolutionRow>();

  return mapFeatureRows(results);
}

export async function resolveAnonymousFeatures(db: D1Database): Promise<FeatureMap> {
  const { results } = await db
    .prepare(
      `SELECT
        f.key AS key,
        f.default_enabled AS default_enabled,
        p.id AS plan_id,
        p.has_full_access AS has_full_access,
        pf.enabled AS plan_enabled,
        pf.limit_value AS plan_limit
      FROM features f
      LEFT JOIN plans p
        ON p.slug = 'anonymous'
      LEFT JOIN plan_features pf
        ON pf.feature_key = f.key AND pf.plan_id = p.id`
    )
    .all<AnonymousFeatureResolutionRow>();

  if (results.length === 0 || results[0].plan_id === null) {
    return { 'links.create': { enabled: true, limit: null, source: 'default' } };
  }

  return mapFeatureRows(results);
}

export async function resolveUserFeatures(
  db: D1Database,
  userId: number,
  planId: number
): Promise<FeatureMap> {
  const now = Math.floor(Date.now() / 1000);
  const { results } = await db
    .prepare(
      `SELECT
        f.key AS key,
        f.default_enabled AS default_enabled,
        p.has_full_access AS has_full_access,
        pf.enabled AS plan_enabled,
        pf.limit_value AS plan_limit,
        ufo.enabled AS override_enabled,
        ufo.limit_value AS override_limit
      FROM features f
      LEFT JOIN plans p
        ON p.id = ?
      LEFT JOIN plan_features pf
        ON pf.feature_key = f.key AND pf.plan_id = p.id
      LEFT JOIN user_feature_overrides ufo
        ON ufo.feature_key = f.key
       AND ufo.user_id = ?
       AND (ufo.expires_at IS NULL OR ufo.expires_at > ?)`
    )
    .bind(planId, userId, now)
    .all<FeatureResolutionRow>();

  return mapFeatureRows(results);
}

export function hasFeature(features: FeatureMap, key: string): boolean {
  return Boolean(features[key]?.enabled);
}

export function getFeatureLimit(features: FeatureMap, key: string): number | null {
  return features[key]?.limit ?? null;
}
