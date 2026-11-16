import type { RuleConfig, RuleType } from '../../shared/contracts.ts';

export interface LinkRow {
  id: number;
  longURL: string;
  shortURL: string;
  mode: 'static' | 'dynamic';
  active_target_id: number | null;
  is_active: number;
}

export interface LinkTargetRow {
  id: number;
  link_id: number;
  label: string;
  target_url: string;
  priority: number;
  rule_type: RuleType;
  rule_config: string | null;
  is_active: number;
}

export interface RequestContextMeta {
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'bot';
  os: 'iOS' | 'Android' | 'Windows' | 'macOS' | 'Linux' | 'Other';
  country: string | null;
  nowEpoch: number;
}

function parseRuleConfig(raw: string | null): RuleConfig {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RuleConfig;
  } catch {
    return null;
  }
}

function matchesConditionalRule(target: LinkTargetRow, ctx: RequestContextMeta): boolean {
  const cfg = parseRuleConfig(target.rule_config);
  if (!cfg) return false;

  switch (target.rule_type) {
    case 'device':
      return Boolean(cfg.devices?.includes(ctx.deviceType));
    case 'os':
      return Boolean(cfg.os?.includes(ctx.os));
    case 'geo':
      return Boolean(ctx.country && cfg.countries?.includes(ctx.country.toUpperCase()));
    case 'schedule': {
      const afterStart = cfg.startAt === undefined || ctx.nowEpoch >= cfg.startAt;
      const beforeEnd = cfg.endAt === undefined || ctx.nowEpoch <= cfg.endAt;
      return afterStart && beforeEnd;
    }
    default:
      return false;
  }
}

function pickWeightedTarget(targets: LinkTargetRow[]): LinkTargetRow | null {
  const weighted = targets
    .map((t) => ({ target: t, weight: parseRuleConfig(t.rule_config)?.weight ?? 0 }))
    .filter((item) => item.weight > 0);

  if (weighted.length === 0) return null;
  const totalWeight = weighted.reduce((acc, item) => acc + item.weight, 0);
  let cursor = Math.random() * totalWeight;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return item.target;
  }
  return weighted[0].target;
}

export function resolveDestination(
  link: LinkRow,
  targets: LinkTargetRow[],
  ctx: RequestContextMeta
): { targetUrl: string; targetId: number | null } {
  if (link.mode !== 'dynamic') {
    return { targetUrl: link.longURL, targetId: null };
  }

  const activeTargets = targets.filter((t) => t.is_active === 1);
  if (activeTargets.length === 0) {
    return { targetUrl: link.longURL, targetId: null };
  }

  // 1. Deterministic conditional rules evaluated by priority ASC, id ASC
  const sorted = [...activeTargets].sort((a, b) => a.priority - b.priority || a.id - b.id);
  for (const target of sorted) {
    if (
      target.rule_type === 'device' ||
      target.rule_type === 'os' ||
      target.rule_type === 'geo' ||
      target.rule_type === 'schedule'
    ) {
      if (matchesConditionalRule(target, ctx)) {
        return { targetUrl: target.target_url, targetId: target.id };
      }
    }
  }

  // 2. Weighted A/B split rules if configured
  const weightTargets = sorted.filter((t) => t.rule_type === 'weight');
  if (weightTargets.length > 0) {
    const picked = pickWeightedTarget(weightTargets);
    if (picked) {
      return { targetUrl: picked.target_url, targetId: picked.id };
    }
  }

  // 3. Creator-selected active target ("escolha de quem criou")
  if (link.active_target_id) {
    const selected = activeTargets.find((t) => t.id === link.active_target_id);
    if (selected) {
      return { targetUrl: selected.target_url, targetId: selected.id };
    }
  }

  return { targetUrl: link.longURL, targetId: null };
}
