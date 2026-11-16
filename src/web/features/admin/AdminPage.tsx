import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { useAuth } from '../../app/AuthContext.tsx';

interface ProfileItem {
  id: number;
  slug: string;
  name: string;
  description: string;
  isSystem: boolean;
  hasFullAccess: boolean;
}

interface FeatureItem {
  key: string;
  name: string;
  description: string;
  category: string;
  defaultEnabled: boolean;
}

interface PlanFeatureItem {
  planId: number;
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
}

interface UserItem {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  planId: number;
  planName: string;
  isActive: boolean;
}

interface OverrideItem {
  userId: number;
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
}

interface AdminOverview {
  plans: ProfileItem[];
  features: FeatureItem[];
  planFeatures: PlanFeatureItem[];
  users: UserItem[];
  overrides: OverrideItem[];
}

export function AdminPage() {
  const { refreshSession } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Access Profile state
  const [profileName, setProfileName] = useState('');
  const [profileDesc, setProfileDesc] = useState('');
  const [profileFullAccess, setProfileFullAccess] = useState(false);
  const [profileFeatureKeys, setProfileFeatureKeys] = useState<string[]>([
    'links.create',
    'links.manage_own',
  ]);
  const [creatingProfile, setCreatingProfile] = useState(false);

  // Create Feature state
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creatingFeature, setCreatingFeature] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<AdminOverview>('/api/admin/overview');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar admin.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleCreateProfile = async (e: FormEvent) => {
    e.preventDefault();
    setCreatingProfile(true);
    setError(null);
    try {
      await apiRequest('/api/admin/profiles', {
        method: 'POST',
        body: JSON.stringify({
          name: profileName,
          description: profileDesc,
          hasFullAccess: profileFullAccess,
          featureKeys: profileFeatureKeys,
        }),
      });
      setProfileName('');
      setProfileDesc('');
      setProfileFullAccess(false);
      setProfileFeatureKeys(['links.create', 'links.manage_own']);
      await loadOverview();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar perfil de acesso.');
    } finally {
      setCreatingProfile(false);
    }
  };

  const handleDeleteProfile = async (profileId: number) => {
    setError(null);
    try {
      await apiRequest(`/api/admin/profiles/${profileId}`, { method: 'DELETE' });
      await loadOverview();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover perfil.');
    }
  };

  const toggleProfileInitialFeature = (key: string) => {
    setProfileFeatureKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleCreateFeature = async (e: FormEvent) => {
    e.preventDefault();
    setCreatingFeature(true);
    setError(null);
    try {
      await apiRequest('/api/admin/features', {
        method: 'POST',
        body: JSON.stringify({ key: newKey, name: newName, description: newDesc }),
      });
      setNewKey('');
      setNewName('');
      setNewDesc('');
      await loadOverview();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar feature.');
    } finally {
      setCreatingFeature(false);
    }
  };

  const handleUserPlanChange = async (userId: number, planId: number) => {
    setError(null);
    try {
      await apiRequest(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ planId }),
      });
      await loadOverview();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar perfil do usuário.');
    }
  };

  const handleOverride = async (
    userId: number,
    featureKey: string,
    nextValue: 'inherit' | 'allow' | 'deny'
  ) => {
    const enabled = nextValue === 'inherit' ? null : nextValue === 'allow';
    await apiRequest(`/api/admin/users/${userId}/features/${encodeURIComponent(featureKey)}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
    await loadOverview();
    await refreshSession();
  };

  const handlePlanFeatureToggle = async (
    planId: number,
    featureKey: string,
    enabled: boolean,
    limitValue: number | null
  ) => {
    setError(null);
    try {
      await apiRequest(`/api/admin/plans/${planId}/features/${encodeURIComponent(featureKey)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled, limitValue }),
      });
      await loadOverview();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar permissão do perfil.');
    }
  };

  if (loading) return <div className="y2k-card-sm">Carregando console administrativo...</div>;
  if (!data) return null;

  const assignableProfiles = data.plans.filter((p) => p.slug !== 'anonymous');

  return (
    <div style={{ display: 'grid', gap: '1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#ffffff' }}>
        <ShieldCheck size={28} aria-hidden="true" />
        <h1 className="page-title" style={{ margin: 0, flex: 1, color: '#ffffff', borderBottomColor: 'rgba(255,255,255,0.35)' }}>
          Administração · Perfis de Acesso & Funcionalidades
        </h1>
      </div>

      {error && (
        <div className="alert-error" role="alert">
          {error}
        </div>
      )}

      {/* 1. Criar Novo Perfil de Acesso */}
      <section className="y2k-window" aria-labelledby="create-profile-heading">
        <div className="y2k-titlebar">
          <h2 id="create-profile-heading" style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>
            PERFIS_DE_ACESSO.EXE — CRIAR NOVO PERFIL
          </h2>
          <span className="y2k-titlebar-dots" aria-hidden="true">
            <span className="y2k-win-glyph">_</span>
            <span className="y2k-win-glyph">□</span>
          </span>
        </div>
        <div className="y2k-window-body">
          <form className="form-stack" onSubmit={handleCreateProfile}>
            <div className="split-grid">
              <div className="field">
                <label htmlFor="profile-name" className="field-label">
                  Nome do Perfil
                </label>
                <input
                  id="profile-name"
                  type="text"
                  className="y2k-input"
                  placeholder="ex: Parceiro / Marketing"
                  required
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="profile-desc" className="field-label">
                  Descrição
                </label>
                <input
                  id="profile-desc"
                  type="text"
                  className="y2k-input"
                  placeholder="Quem pode usar este perfil e o que libera"
                  value={profileDesc}
                  onChange={(e) => setProfileDesc(e.target.value)}
                />
              </div>
            </div>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={profileFullAccess}
                onChange={(e) => setProfileFullAccess(e.target.checked)}
              />
              <span>Acesso Total (como Admin — libera todas as funcionalidades atuais e futuras)</span>
            </label>

            {!profileFullAccess && (
              <fieldset style={{ border: '2px solid var(--bevel-mid)', borderRadius: 6, padding: '0.75rem', margin: 0 }}>
                <legend className="field-label">Funcionalidades Iniciais Liberadas</legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', marginTop: '0.45rem' }}>
                  {data.features.map((f) => (
                    <label
                      key={f.key}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.88rem' }}
                    >
                      <input
                        type="checkbox"
                        checked={profileFeatureKeys.includes(f.key)}
                        onChange={() => toggleProfileInitialFeature(f.key)}
                      />
                      <span>
                        <strong>{f.name}</strong> ({f.key})
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div>
              <button type="submit" className="y2k-btn y2k-btn-primary y2k-btn-sm" disabled={creatingProfile}>
                <Plus size={16} aria-hidden="true" />
                <span>{creatingProfile ? 'Criando perfil...' : 'Criar Perfil de Acesso'}</span>
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* 2. Matriz Perfil de Acesso x Funcionalidade */}
      <section className="y2k-card" aria-labelledby="admin-plans-heading">
        <h2
          id="admin-plans-heading"
          style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 900, textTransform: 'uppercase' }}
        >
          Perfis de Acesso × Funcionalidades
        </h2>
        <div tabIndex={0} role="region" aria-labelledby="admin-plans-heading" className="table-wrapper">
          <table className="y2k-table">
            <thead>
              <tr>
                <th>Funcionalidade</th>
                {data.plans.map((p) => (
                  <th key={p.id}>
                    <div>{p.name}</div>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                      {p.isSystem && <span className="tag tag-muted">Sistema</span>}
                      {p.hasFullAccess && <span className="tag tag-purple">Total</span>}
                      {!p.isSystem && (
                        <button
                          type="button"
                          className="y2k-btn y2k-btn-sm y2k-btn-danger"
                          style={{ minBlockSize: 28, padding: '0 0.45rem', fontSize: '0.72rem' }}
                          aria-label={`Excluir perfil ${p.name}`}
                          onClick={() => handleDeleteProfile(p.id)}
                        >
                          <Trash2 size={12} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.features.map((f) => (
                <tr key={f.key}>
                  <th scope="row">
                    <div>{f.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{f.key}</div>
                  </th>
                  {data.plans.map((p) => {
                    if (p.hasFullAccess) {
                      return (
                        <td key={p.id} data-label={p.name}>
                          <span className="tag tag-purple">Acesso Total</span>
                        </td>
                      );
                    }
                    const pf = data.planFeatures.find((x) => x.planId === p.id && x.featureKey === f.key);
                    const isEnabled = pf ? pf.enabled : f.defaultEnabled;
                    return (
                      <td key={p.id} data-label={p.name}>
                        <button
                          type="button"
                          className={`y2k-btn y2k-btn-sm ${isEnabled ? 'y2k-btn-mint' : ''}`}
                          onClick={() =>
                            handlePlanFeatureToggle(p.id, f.key, !isEnabled, pf?.limitValue ?? null)
                          }
                        >
                          {isEnabled ? 'Ativo' : 'Bloqueado'}
                          {pf?.limitValue !== null && pf?.limitValue !== undefined ? ` (${pf.limitValue})` : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Usuários e overrides individuais */}
      <section className="y2k-card" aria-labelledby="admin-users-heading">
        <h2
          id="admin-users-heading"
          style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 900, textTransform: 'uppercase' }}
        >
          Usuários & Overrides Individuais
        </h2>
        <div tabIndex={0} role="region" aria-labelledby="admin-users-heading" className="table-wrapper">
          <table className="y2k-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Perfil de Acesso</th>
                {data.features.map((f) => (
                  <th key={f.key} title={f.description}>
                    {f.key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <th scope="row">
                    <div>{u.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{u.email}</div>
                    <span className="tag tag-muted">{u.role}</span>
                  </th>
                  <td data-label="Perfil de Acesso">
                    <select
                      aria-label={`Perfil de ${u.email}`}
                      className="y2k-select"
                      style={{ minBlockSize: 40, padding: '0.35rem' }}
                      value={u.planId}
                      onChange={(e) => handleUserPlanChange(u.id, Number(e.target.value))}
                    >
                      {assignableProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  {data.features.map((f) => {
                    const ov = data.overrides.find((o) => o.userId === u.id && o.featureKey === f.key);
                    const value = ov ? (ov.enabled ? 'allow' : 'deny') : 'inherit';
                    return (
                      <td key={f.key} data-label={f.key}>
                        <select
                          aria-label={`${f.key} para ${u.email}`}
                          className="y2k-select"
                          style={{
                            minBlockSize: 38,
                            padding: '0.25rem 0.45rem',
                            background:
                              value === 'allow'
                                ? 'var(--accent-mint)'
                                : value === 'deny'
                                  ? '#ffe4e6'
                                  : '#ffffff',
                          }}
                          value={value}
                          onChange={(e) =>
                            handleOverride(u.id, f.key, e.target.value as 'inherit' | 'allow' | 'deny')
                          }
                        >
                          <option value="inherit">Perfil</option>
                          <option value="allow">Liberar</option>
                          <option value="deny">Bloquear</option>
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Registrar nova funcionalidade futura */}
      <section className="y2k-card-sm" aria-labelledby="new-feature-heading">
        <h2
          id="new-feature-heading"
          style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 900, textTransform: 'uppercase' }}
        >
          Registrar Nova Funcionalidade
        </h2>
        <form className="form-stack" onSubmit={handleCreateFeature}>
          <div className="split-grid">
            <div className="field">
              <label htmlFor="feat-key" className="field-label">
                Chave (key)
              </label>
              <input
                id="feat-key"
                type="text"
                className="y2k-input"
                placeholder="ex: links.webhooks"
                required
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="feat-name" className="field-label">
                Nome visível
              </label>
              <input
                id="feat-name"
                type="text"
                className="y2k-input"
                placeholder="ex: Webhooks de Clique"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="feat-desc" className="field-label">
              Descrição
            </label>
            <input
              id="feat-desc"
              type="text"
              className="y2k-input"
              placeholder="Descrição da funcionalidade"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
          <div>
            <button type="submit" className="y2k-btn y2k-btn-primary y2k-btn-sm" disabled={creatingFeature}>
              <Plus size={16} aria-hidden="true" />
              <span>{creatingFeature ? 'Registrando...' : 'Adicionar Funcionalidade'}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
