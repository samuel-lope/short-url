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

// --- Shared API DTOs ---

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ShortenResponse {
  id: number;
  short_code: string;
  short_url: string;
  original_url: string;
  title?: string | null;
  mode?: 'static' | 'dynamic';
}

export interface LinkSummary {
  id: number;
  longUrl: string;
  shortCode: string;
  shortUrl: string;
  qrUrl: string;
  title: string | null;
  mode: 'static' | 'dynamic';
  activeTargetId: number | null;
  activeTargetLabel: string | null;
  activeTargetUrl: string | null;
  targetsCount: number;
  isActive: boolean;
  totalClicks: number;
  hasQr: boolean;
  qrScanCount: number | null;
  createdAt: number;
  updatedAt?: number | null;
}

export interface LinkTargetItem {
  id: number;
  linkId: number;
  label: string;
  targetUrl: string;
  priority: number;
  ruleType: RuleType;
  ruleConfig: RuleConfig;
  isActive: boolean;
  clicksCount: number;
  createdAt?: number;
}

export interface LinkQrInfo {
  id: number;
  isDynamic?: boolean;
  scanCount: number;
  style: Partial<QrStyle>;
  updatedAt?: number;
}

export interface LinkDetailResponse {
  link: {
    id: number;
    longUrl: string;
    shortCode: string;
    shortUrl: string;
    qrUrl: string;
    title: string | null;
    mode: 'static' | 'dynamic';
    activeTargetId: number | null;
    isActive: boolean;
    totalClicks: number;
    createdAt?: number;
    updatedAt?: number | null;
  };
  targets: LinkTargetItem[];
  qrCode: LinkQrInfo | null;
}

export interface OverviewData {
  summary: {
    totalLinks: number;
    totalClicks: number;
    dynamicLinks: number;
    totalQrCodes: number;
    totalScans: number;
  };
  dailySeries?: Array<{
    day: string;
    total: number;
    qrScans: number;
    linkClicks: number;
  }>;
}

export interface AnalyticsBreakdownItem {
  label: string;
  count: number;
}

export interface RecentClickItem {
  id: number;
  source: string;
  clickedAt: number;
  country: string | null;
  city: string | null;
  deviceType: string | null;
  os: string | null;
  browser: string | null;
  referer: string | null;
}

export interface AnalyticsData {
  link: {
    id: number;
    shortCode: string;
    title: string | null;
    totalClicks: number;
  };
  totals: {
    recordedEvents: number;
    uniqueVisitors: number;
    qrScans: number;
    linkClicks: number;
  };
  dailySeries: Array<{
    day: string;
    total: number;
    qrScans: number;
    linkClicks: number;
  }>;
  byTarget: Array<{
    id: number;
    label: string;
    targetUrl: string;
    clicksCount: number;
  }>;
  detailedLocked: boolean;
  detailed: {
    byCountry: AnalyticsBreakdownItem[];
    byDevice: AnalyticsBreakdownItem[];
    byOs: AnalyticsBreakdownItem[];
    byReferer: AnalyticsBreakdownItem[];
    recentEvents: RecentClickItem[];
  } | null;
}

export interface ProfileItem {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  hasFullAccess: boolean;
}

export interface FeatureItem {
  key: string;
  name: string;
  description: string | null;
  category: string;
  defaultEnabled: boolean;
}

export interface PlanFeatureItem {
  planId: number;
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
}

export interface UserItem {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  planId: number;
  planName: string;
  isActive: boolean;
  createdAt?: number;
}

export interface OverrideItem {
  userId: number;
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
  expiresAt?: number | null;
}

export interface AdminOverview {
  plans: ProfileItem[];
  features: FeatureItem[];
  planFeatures: PlanFeatureItem[];
  users: UserItem[];
  overrides: OverrideItem[];
}

export type OverrideValue = 'inherit' | 'allow' | 'deny';

// --- Shared Request Validation Schemas ---

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres.').max(100),
  email: z.string().trim().email('E-mail inválido.').max(180),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres.').max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email('E-mail inválido.'),
  password: z.string().min(1, 'Senha obrigatória.'),
});

export const createLinkSchema = z.object({
  url: z.string().min(1, 'URL é obrigatória.'),
  title: z.string().trim().max(120).optional().nullable(),
  customSlug: z.string().trim().optional().nullable(),
  mode: z.enum(['static', 'dynamic']).optional().default('static'),
});

export const updateLinkSchema = z.object({
  title: z.string().trim().max(120).optional().nullable(),
  url: z.string().optional(),
  mode: z.enum(['static', 'dynamic']).optional(),
  isActive: z.boolean().optional(),
});

export const createTargetSchema = z.object({
  label: z.string().trim().min(1, 'Nome do destino é obrigatório.').max(80),
  targetUrl: z.string().min(1, 'URL de destino é obrigatória.'),
  ruleType: z.enum(RULE_TYPES).optional().default('manual'),
  ruleConfig: ruleConfigSchema,
  priority: z.number().int().min(0).max(999).optional().default(0),
  isActive: z.boolean().optional().default(true),
  setAsActive: z.boolean().optional().default(false),
});

export const updateTargetSchema = createTargetSchema.partial();

export const createFeatureSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9._-]{3,60}$/, 'Chave inválida (use letras minúsculas, números, ponto, - ou _).'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional().default(''),
  category: z.string().trim().min(2).max(40).optional().default('custom'),
  defaultEnabled: z.boolean().optional().default(false),
});

export const createProfileSchema = z.object({
  name: z.string().trim().min(2, 'Nome do perfil deve ter ao menos 2 caracteres.').max(60),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{2,40}$/, 'Slug inválido (use letras minúsculas, números, - ou _).')
    .optional(),
  description: z.string().trim().max(240).optional().default(''),
  hasFullAccess: z.boolean().optional().default(false),
  featureKeys: z.array(z.string()).optional().default(['links.create', 'links.manage_own']),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(240).optional(),
  hasFullAccess: z.boolean().optional(),
});

export const overrideSchema = z.object({
  enabled: z.boolean().nullable(),
  limitValue: z.number().int().min(0).nullable().optional(),
  expiresAt: z.number().int().nullable().optional(),
});

export const updateUserSchema = z.object({
  planId: z.number().int().positive().optional(),
  role: z.enum(['user', 'admin']).optional(),
  isActive: z.boolean().optional(),
});

export const atomicPermissionsSchema = z.object({
  planId: z.number().int().positive(),
  isActive: z.boolean().optional(),
  overrides: z
    .array(
      z.object({
        featureKey: z.string().min(1),
        enabled: z.boolean().nullable(),
        limitValue: z.number().int().min(0).nullable().optional(),
        expiresAt: z.number().int().nullable().optional(),
      })
    )
    .default([]),
});

export const updatePlanFeatureSchema = z.object({
  enabled: z.boolean(),
  limitValue: z.number().int().min(0).nullable().optional(),
});
