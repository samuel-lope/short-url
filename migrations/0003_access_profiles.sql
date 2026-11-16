-- Evolve plans into Access Profiles (Perfis de Acesso)
ALTER TABLE plans ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN has_full_access INTEGER NOT NULL DEFAULT 0;

-- Register new granular features for URL ownership & access profile management
INSERT OR IGNORE INTO features (key, name, description, category, default_enabled) VALUES
    ('links.manage_own', 'Controlar Próprias URLs', 'Visualizar, editar, pausar e excluir URLs criadas na conta', 'links', 1),
    ('admin.profiles', 'Criar Perfis de Acesso', 'Criar, editar e gerenciar perfis de acesso e permissões', 'admin', 0);

-- Reconfigure the 3 pre-defined system profiles:
-- 1 = Usuário Registrado, 2 = Anônimo, 3 = Admin
UPDATE plans
SET slug = 'registered',
    name = 'Usuário Registrado',
    description = 'Acesso às funcionalidades definidas pelo admin e controle das próprias URLs criadas',
    is_system = 1,
    has_full_access = 0
WHERE id = 1;

UPDATE plans
SET slug = 'anonymous',
    name = 'Anônimo',
    description = 'Acesso inicial padrão para visitantes não autenticados',
    is_system = 1,
    has_full_access = 0
WHERE id = 2;

UPDATE plans
SET slug = 'admin',
    name = 'Admin',
    description = 'Acesso total ao sistema, funcionalidades e criação de perfis de acesso',
    is_system = 1,
    has_full_access = 1
WHERE id = 3;

-- Ensure system profiles exist even on clean installs where ids 1..3 were inserted earlier
INSERT OR IGNORE INTO plans (id, slug, name, description, is_system, has_full_access) VALUES
    (1, 'registered', 'Usuário Registrado', 'Acesso às funcionalidades definidas pelo admin e controle das próprias URLs criadas', 1, 0),
    (2, 'anonymous', 'Anônimo', 'Acesso inicial padrão para visitantes não autenticados', 1, 0),
    (3, 'admin', 'Admin', 'Acesso total ao sistema, funcionalidades e criação de perfis de acesso', 1, 1);

-- Reset and seed exact default permissions for the 3 pre-defined profiles
DELETE FROM plan_features WHERE plan_id IN (1, 2, 3);

INSERT INTO plan_features (plan_id, feature_key, enabled, limit_value) VALUES
    -- Perfil 1: Usuário Registrado
    (1, 'links.create', 1, 50),
    (1, 'links.manage_own', 1, NULL),
    (1, 'links.custom_slug', 0, NULL),
    (1, 'url.dynamic_switch', 1, 5),
    (1, 'url.conditional_rules', 0, NULL),
    (1, 'qr.dynamic', 1, 20),
    (1, 'analytics.basic', 1, NULL),
    (1, 'analytics.detailed', 0, NULL),
    (1, 'admin.profiles', 0, NULL),
    -- Perfil 2: Anônimo (acesso inicial padrão)
    (2, 'links.create', 1, NULL),
    (2, 'links.manage_own', 0, NULL),
    (2, 'links.custom_slug', 0, NULL),
    (2, 'url.dynamic_switch', 0, NULL),
    (2, 'url.conditional_rules', 0, NULL),
    (2, 'qr.dynamic', 0, NULL),
    (2, 'analytics.basic', 0, NULL),
    (2, 'analytics.detailed', 0, NULL),
    (2, 'admin.profiles', 0, NULL),
    -- Perfil 3: Admin (acesso total)
    (3, 'links.create', 1, NULL),
    (3, 'links.manage_own', 1, NULL),
    (3, 'links.custom_slug', 1, NULL),
    (3, 'url.dynamic_switch', 1, NULL),
    (3, 'url.conditional_rules', 1, NULL),
    (3, 'qr.dynamic', 1, NULL),
    (3, 'analytics.basic', 1, NULL),
    (3, 'analytics.detailed', 1, NULL),
    (3, 'admin.profiles', 1, NULL);
