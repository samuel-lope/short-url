import { z } from 'zod';

export const FEATURE_KEYS = [
  'links.create',
  'links.manage_own',
  'links.custom_slug',
  'url.dynamic_switch',
  'url.conditional_rules',
  'qr.dynamic',
  'analytics.basic',
  'analytics.detailed',
  'admin.profiles',
] as const;

export type KnownFeatureKey = (typeof FEATURE_KEYS)[number];

export const RESERVED_SLUGS = new Set([
  'api',
  'v1',
  'q',
  'app',
  'login',
  'register',
  'logout',
  'admin',
  'assets',
  'favicon.ico',
  'robots.txt',
  'health',
]);

export const RULE_TYPES = ['manual', 'device', 'os', 'geo', 'schedule', 'weight'] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export const ruleConfigSchema = z
  .object({
    devices: z.array(z.enum(['mobile', 'tablet', 'desktop', 'bot'])).optional(),
    os: z.array(z.enum(['iOS', 'Android', 'Windows', 'macOS', 'Linux', 'Other'])).optional(),
    countries: z.array(z.string().length(2).toUpperCase()).optional(),
    startAt: z.number().int().optional(),
    endAt: z.number().int().optional(),
    weight: z.number().int().min(1).max(100).optional(),
  })
  .optional()
  .nullable();

export type RuleConfig = z.infer<typeof ruleConfigSchema>;

export const qrStyleSchema = z.object({
  fgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#000000'),
  bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff'),
  errorCorrectionLevel: z.enum(['L', 'M', 'Q', 'H']).default('M'),
  margin: z.number().int().min(0).max(10).default(2),
  frameLabel: z.string().max(32).optional().default(''),
});

export type QrStyle = z.infer<typeof qrStyleSchema>;

export interface FeatureCapability {
  enabled: boolean;
  limit: number | null;
  source: 'override' | 'plan' | 'default' | 'full_access';
}

export type FeatureMap = Record<string, FeatureCapability>;

export interface UserProfile {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  plan: {
    id: number;
    slug: string;
    name: string;
    hasFullAccess: boolean;
  };
}
