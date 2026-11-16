-- 1. Plans & Feature Registry
CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS features (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    default_enabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS plan_features (
    plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL REFERENCES features(key) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 0,
    limit_value INTEGER,
    PRIMARY KEY (plan_id, feature_key)
);

-- 2. Users & Sessions
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    plan_id INTEGER NOT NULL REFERENCES plans(id),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS user_feature_overrides (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL REFERENCES features(key) ON DELETE CASCADE,
    enabled INTEGER NOT NULL,
    limit_value INTEGER,
    expires_at INTEGER,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (user_id, feature_key)
);

-- 3. Extend existing links table non-destructively
ALTER TABLE links ADD COLUMN user_id INTEGER;
ALTER TABLE links ADD COLUMN mode TEXT NOT NULL DEFAULT 'static';
ALTER TABLE links ADD COLUMN active_target_id INTEGER;
ALTER TABLE links ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE links ADD COLUMN total_clicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE links ADD COLUMN updated_at INTEGER;

-- 4. Dynamic URL Targets & Rules
CREATE TABLE IF NOT EXISTS link_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    target_url TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    rule_type TEXT NOT NULL DEFAULT 'manual',
    rule_config TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    clicks_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 5. Dynamic QR Codes
CREATE TABLE IF NOT EXISTS qr_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id INTEGER NOT NULL UNIQUE REFERENCES links(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_dynamic INTEGER NOT NULL DEFAULT 1,
    style_json TEXT NOT NULL DEFAULT '{}',
    scan_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 6. Usage Tracking (Click & Scan Events)
CREATE TABLE IF NOT EXISTS click_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    target_id INTEGER,
    source TEXT NOT NULL DEFAULT 'link',
    clicked_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    country TEXT,
    city TEXT,
    device_type TEXT,
    os TEXT,
    browser TEXT,
    referer TEXT,
    ip_hash TEXT
);

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_links_user_id ON links(user_id);
CREATE INDEX IF NOT EXISTS idx_links_short_url ON links(shortURL);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_link_targets_link_id ON link_targets(link_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_user_id ON qr_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_click_events_link_time ON click_events(link_id, clicked_at DESC);

-- 8. Seed Plans
INSERT OR IGNORE INTO plans (id, slug, name, description) VALUES
    (1, 'free', 'Gratuito', 'Encurtamento, URL dinâmica manual, QR Code dinâmico e métricas básicas'),
    (2, 'pro', 'Profissional', 'Slugs personalizados, regras condicionais e analytics detalhado'),
    (3, 'enterprise', 'Enterprise', 'Todos os recursos liberados sem limites');

-- 9. Seed Feature Registry
INSERT OR IGNORE INTO features (key, name, description, category, default_enabled) VALUES
    ('links.create', 'Criar Links', 'Criar e gerenciar links encurtados na conta', 'links', 1),
    ('links.custom_slug', 'Slug Personalizado', 'Definir código curto customizado para o link', 'links', 0),
    ('url.dynamic_switch', 'URL Dinâmica (Manual)', 'Alterar o destino ativo do link curto a qualquer momento', 'dynamic_url', 1),
    ('url.conditional_rules', 'Regras Condicionais', 'Roteamento automático por dispositivo, OS, país, horário ou peso A/B', 'dynamic_url', 0),
    ('qr.dynamic', 'QR Code Dinâmico', 'Gerar e personalizar QR Code dinâmico vinculado ao link curto', 'qr', 1),
    ('analytics.basic', 'Métricas Básicas', 'Contagem de cliques, scans de QR e série temporal diária', 'analytics', 1),
    ('analytics.detailed', 'Analytics Detalhado', 'Detalhamento por país, dispositivo, sistema operacional e referer', 'analytics', 0);

-- 10. Seed Plan -> Feature Matrix
INSERT OR IGNORE INTO plan_features (plan_id, feature_key, enabled, limit_value) VALUES
    -- Free (plan_id = 1)
    (1, 'links.create', 1, 50),
    (1, 'links.custom_slug', 0, NULL),
    (1, 'url.dynamic_switch', 1, 5),
    (1, 'url.conditional_rules', 0, NULL),
    (1, 'qr.dynamic', 1, 20),
    (1, 'analytics.basic', 1, NULL),
    (1, 'analytics.detailed', 0, NULL),
    -- Pro (plan_id = 2)
    (2, 'links.create', 1, 1000),
    (2, 'links.custom_slug', 1, NULL),
    (2, 'url.dynamic_switch', 1, 25),
    (2, 'url.conditional_rules', 1, NULL),
    (2, 'qr.dynamic', 1, 500),
    (2, 'analytics.basic', 1, NULL),
    (2, 'analytics.detailed', 1, NULL),
    -- Enterprise (plan_id = 3)
    (3, 'links.create', 1, NULL),
    (3, 'links.custom_slug', 1, NULL),
    (3, 'url.dynamic_switch', 1, NULL),
    (3, 'url.conditional_rules', 1, NULL),
    (3, 'qr.dynamic', 1, NULL),
    (3, 'analytics.basic', 1, NULL),
    (3, 'analytics.detailed', 1, NULL);
