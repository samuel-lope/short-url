import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Layers, Plus, Settings2, Shield, Sparkles, Trash2, Users } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { useAuth } from '../../app/AuthContext.tsx';
import { Modal } from '../../shared/Modal.tsx';
import {
  Alert,
  Badge,
  BentoGrid,
  Button,
  Field,
  PageHeader,
  SelectInput,
  Skeleton,
  StatTile,
  TextInput,
  Tile,
} from '../../shared/ui/index.ts';

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

type OverrideValue = 'inherit' | 'allow' | 'deny';

export function AdminPage() {
  const { refreshSession } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // F7: Create Access Profile
  const [profileName, setProfileName] = useState('');
  const [profileDesc, setProfileDesc] = useState('');
  const [profileFullAccess, setProfileFullAccess] = useState(false);
  const [profileFeatureKeys, setProfileFeatureKeys] = useState<string[]>([
    'links.create',
    'links.manage_own',
  ]);
  const [creatingProfile, setCreatingProfile] = useState(false);

  // U3: Delete profile confirmation modal
  const [profileToDelete, setProfileToDelete] = useState<ProfileItem | null>(null);

  // U1/U2: User edit dialog state (explicit Save button)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [draftPlanId, setDraftPlanId] = useState<number>(1);
  const [draftOverrides, setDraftOverrides] = useState<Record<string, OverrideValue>>({});
  const [savingUser, setSavingUser] = useState(false);

  // F8: Create Feature
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
    setStatusMsg(null);
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
      setStatusMsg('Perfil de acesso criado com sucesso.');
      await loadOverview();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar perfil de acesso.');
    } finally {
      setCreatingProfile(false);
    }
  };

  const handleConfirmDeleteProfile = async () => {
    if (!profileToDelete) return;
    setError(null);
    setStatusMsg(null);
    try {
      await apiRequest(`/api/admin/profiles/${profileToDelete.id}`, { method: 'DELETE' });
      setStatusMsg(`Perfil "${profileToDelete.name}" removido.`);
      setProfileToDelete(null);
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
    setStatusMsg(null);
    try {
      await apiRequest('/api/admin/features', {
        method: 'POST',
        body: JSON.stringify({ key: newKey, name: newName, description: newDesc }),
      });
      setNewKey('');
      setNewName('');
      setNewDesc('');
      setStatusMsg('Nova funcionalidade registrada.');
      await loadOverview();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar feature.');
    } finally {
      setCreatingFeature(false);
    }
  };

  const openEditUserModal = (user: UserItem) => {
    if (!data) return;
    setEditingUser(user);
    setDraftPlanId(user.planId);
    const initialOverrides: Record<string, OverrideValue> = {};
    for (const f of data.features) {
      const ov = data.overrides.find((o) => o.userId === user.id && o.featureKey === f.key);
      initialOverrides[f.key] = ov ? (ov.enabled ? 'allow' : 'deny') : 'inherit';
    }
    setDraftOverrides(initialOverrides);
  };

  const handleSaveUserChanges = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUser || !data) return;
    setSavingUser(true);
    setError(null);
    setStatusMsg(null);

    try {
      const overridesPayload = data.features
        .map((f) => {
          const prevOv = data.overrides.find(
            (o) => o.userId === editingUser.id && o.featureKey === f.key
          );
          const prevVal: OverrideValue = prevOv ? (prevOv.enabled ? 'allow' : 'deny') : 'inherit';
          const nextVal = draftOverrides[f.key] ?? 'inherit';
          if (nextVal === prevVal) return null;
          return {
            featureKey: f.key,
            enabled: nextVal === 'inherit' ? null : nextVal === 'allow',
          };
        })
        .filter((item): item is { featureKey: string; enabled: boolean | null } => item !== null);

      await apiRequest(`/api/admin/users/${editingUser.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({
          planId: draftPlanId,
          overrides: overridesPayload,
        }),
      });

      setStatusMsg(`Permissões de ${editingUser.email} atualizadas.`);
      setEditingUser(null);
      await loadOverview();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar permissões do usuário.');
    } finally {
      setSavingUser(false);
    }
  };

  const handlePlanFeatureToggle = async (
    planId: number,
    featureKey: string,
    enabled: boolean,
    limitValue: number | null
  ) => {
    setError(null);
    setStatusMsg(null);
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

  if (loading) {
    return (
      <Tile c={4}>
        <Skeleton rows={5} />
      </Tile>
    );
  }
  if (!data) return null;

  const assignableProfiles = data.plans.filter((p) => p.slug !== 'anonymous');

  return (
    <div>
      <PageHeader
        title="Administração"
        subtitle="Perfis de acesso, liberações por usuário e registro de novas funcionalidades"
      />

      {error && (
        <div style={{ marginBottom: '1rem' }}>
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {statusMsg && (
        <div style={{ marginBottom: '1rem' }}>
          <Alert tone="success" role="status">
            {statusMsg}
          </Alert>
        </div>
      )}

      <BentoGrid cols={4} label="Console administrativo">
        <StatTile label="Usuários" value={data.users.length} icon={<Users size={16} aria-hidden="true" />} />
        <StatTile label="Perfis de acesso" value={data.plans.length} icon={<Shield size={16} aria-hidden="true" />} />
        <StatTile label="Funcionalidades" value={data.features.length} icon={<Layers size={16} aria-hidden="true" />} />
        <StatTile
          label="Overrides ativos"
          value={data.overrides.length}
          variant="accent"
          icon={<Sparkles size={16} aria-hidden="true" />}
        />

        <Tile c={2} title="Criar perfil de acesso" subtitle="Defina permissões padrão reutilizáveis" as="section">
          <form className="form-stack" onSubmit={handleCreateProfile}>
            <div className="form-row">
              <Field label="Nome do perfil" htmlFor="profile-name" required>
                {({ inputId }) => (
                  <TextInput
                    id={inputId}
                    type="text"
                    placeholder="ex: Parceiro / Marketing"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Descrição" htmlFor="profile-desc">
                {({ inputId }) => (
                  <TextInput
                    id={inputId}
                    type="text"
                    placeholder="Quem usa este perfil"
                    value={profileDesc}
                    onChange={(e) => setProfileDesc(e.target.value)}
                  />
                )}
              </Field>
            </div>

            <label className="choice-pill" style={{ width: 'fit-content' }}>
              <input
                type="checkbox"
                checked={profileFullAccess}
                onChange={(e) => setProfileFullAccess(e.target.checked)}
              />
              <span>Acesso total (libera todas as features atuais e futuras)</span>
            </label>

            {!profileFullAccess && (
              <fieldset className="choice-fieldset">
                <legend className="choice-legend">Funcionalidades iniciais liberadas</legend>
                <div className="choice-list">
                  {data.features.map((f) => (
                    <label key={f.key} className="choice-pill">
                      <input
                        type="checkbox"
                        checked={profileFeatureKeys.includes(f.key)}
                        onChange={() => toggleProfileInitialFeature(f.key)}
                      />
                      <span>{f.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div>
              <Button type="submit" variant="primary" size="sm" disabled={creatingProfile}>
                <Plus size={16} aria-hidden="true" />
                <span>{creatingProfile ? 'Criando perfil...' : 'Criar perfil de acesso'}</span>
              </Button>
            </div>
          </form>
        </Tile>

        <Tile c={2} variant="muted" title="Perfis cadastrados" subtitle="Perfis de sistema são protegidos contra remoção">
          <div style={{ display: 'grid', gap: '0.65rem' }}>
            {data.plans.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  padding: '0.75rem 0.9rem',
                  borderRadius: 'var(--radius-control)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                    <strong>{p.name}</strong>
                    {p.isSystem && <Badge>Sistema</Badge>}
                    {p.hasFullAccess && <Badge tone="accent">Acesso total</Badge>}
                  </div>
                  {p.description && (
                    <div className="text-muted" style={{ fontSize: '0.82rem', marginTop: '0.15rem' }}>
                      {p.description}
                    </div>
                  )}
                </div>
                {!p.isSystem && (
                  <Button
                    variant="danger"
                    size="sm"
                    aria-label={`Excluir perfil ${p.name}`}
                    onClick={() => setProfileToDelete(p)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Tile>

        <Tile c={4} title="Perfis de acesso × Funcionalidades">
          <div tabIndex={0} role="region" aria-label="Matriz de permissões" className="table-wrapper">
            <table className="bento-table">
              <thead>
                <tr>
                  <th>Funcionalidade</th>
                  {data.plans.map((p) => (
                    <th key={p.id}>{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.features.map((f) => (
                  <tr key={f.key}>
                    <th scope="row">
                      <div>{f.name}</div>
                      <div className="mono-url text-muted" style={{ fontSize: '0.78rem', fontWeight: 400 }}>
                        {f.key}
                      </div>
                    </th>
                    {data.plans.map((p) => {
                      if (p.hasFullAccess) {
                        return (
                          <td key={p.id} data-label={p.name}>
                            <Badge tone="accent">Acesso total</Badge>
                          </td>
                        );
                      }
                      const pf = data.planFeatures.find((x) => x.planId === p.id && x.featureKey === f.key);
                      const isEnabled = pf ? pf.enabled : f.defaultEnabled;
                      return (
                        <td key={p.id} data-label={p.name}>
                          <Button
                            size="sm"
                            variant={isEnabled ? 'primary' : 'secondary'}
                            onClick={() =>
                              handlePlanFeatureToggle(p.id, f.key, !isEnabled, pf?.limitValue ?? null)
                            }
                          >
                            {isEnabled ? 'Ativo' : 'Bloqueado'}
                            {pf?.limitValue !== null && pf?.limitValue !== undefined ? ` (${pf.limitValue})` : ''}
                          </Button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tile>

        <Tile c={4} title="Usuários e liberações individuais" subtitle="Clique em Editar para alterar o perfil ou liberar recursos específicos">
          <div tabIndex={0} role="region" aria-label="Lista de usuários" className="table-wrapper">
            <table className="bento-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Perfil</th>
                  <th>Overrides</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => {
                  const userOverrides = data.overrides.filter((o) => o.userId === u.id);
                  return (
                    <tr key={u.id}>
                      <th scope="row">
                        <div>{u.name}</div>
                        <div className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 400 }}>
                          {u.email}
                        </div>
                      </th>
                      <td data-label="Perfil">
                        <Badge tone={u.role === 'admin' ? 'accent' : 'neutral'}>{u.planName}</Badge>
                      </td>
                      <td data-label="Overrides">
                        {userOverrides.length === 0 ? (
                          <span className="text-muted" style={{ fontSize: '0.84rem' }}>
                            Herdado do perfil
                          </span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                            {userOverrides.map((ov) => (
                              <Badge key={ov.featureKey} tone={ov.enabled ? 'success' : 'danger'}>
                                {ov.featureKey}: {ov.enabled ? 'Liberado' : 'Bloqueado'}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td data-label="Ações">
                        <Button size="sm" onClick={() => openEditUserModal(u)}>
                          <Settings2 size={14} aria-hidden="true" />
                          <span>Editar</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Tile>

        <Tile c={2} title="Registrar nova funcionalidade" as="section">
          <form className="form-stack" onSubmit={handleCreateFeature}>
            <div className="form-row">
              <Field label="Chave (key)" htmlFor="feat-key" required>
                {({ inputId }) => (
                  <TextInput
                    id={inputId}
                    type="text"
                    placeholder="ex: links.webhooks"
                    required
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Nome visível" htmlFor="feat-name" required>
                {({ inputId }) => (
                  <TextInput
                    id={inputId}
                    type="text"
                    placeholder="ex: Webhooks de Clique"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <Field label="Descrição" htmlFor="feat-desc">
              {({ inputId }) => (
                <TextInput
                  id={inputId}
                  type="text"
                  placeholder="Descrição da funcionalidade"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              )}
            </Field>
            <div>
              <Button type="submit" variant="primary" size="sm" disabled={creatingFeature}>
                <Plus size={16} aria-hidden="true" />
                <span>{creatingFeature ? 'Registrando...' : 'Adicionar funcionalidade'}</span>
              </Button>
            </div>
          </form>
        </Tile>

        <Tile
          c={2}
          variant="muted"
          title="Como funcionam as liberações"
          subtitle="Ordem de resolução aplicada no servidor e no React"
        >
          <ol style={{ margin: 0, paddingLeft: '1.2rem', display: 'grid', gap: '0.45rem', fontSize: '0.9rem' }}>
            <li>Override explícito do usuário (Liberar ou Bloquear).</li>
            <li>Perfil com acesso total (<code>Admin</code>) libera tudo automaticamente.</li>
            <li>Permissão definida na matriz do perfil atribuído ao usuário.</li>
            <li>Valor padrão da funcionalidade (<code>default_enabled</code>).</li>
          </ol>
        </Tile>
      </BentoGrid>

      <Modal
        open={Boolean(profileToDelete)}
        title="Excluir perfil de acesso?"
        onClose={() => setProfileToDelete(null)}
      >
        <p style={{ marginTop: 0 }}>
          Usuários atualmente no perfil <strong>{profileToDelete?.name}</strong> serão movidos para o perfil padrão <strong>Usuário Registrado</strong>.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
          <Button size="sm" autoFocus onClick={() => setProfileToDelete(null)}>
            Cancelar
          </Button>
          <Button variant="danger" size="sm" onClick={handleConfirmDeleteProfile}>
            Confirmar exclusão
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(editingUser)}
        title={`Permissões · ${editingUser?.name ?? ''}`}
        onClose={() => setEditingUser(null)}
      >
        {editingUser && (
          <form className="form-stack" onSubmit={handleSaveUserChanges}>
            <div className="text-muted" style={{ fontSize: '0.88rem' }}>
              {editingUser.email}
            </div>

            <Field label="Perfil de acesso" htmlFor="edit-user-plan">
              {({ inputId }) => (
                <SelectInput
                  id={inputId}
                  value={draftPlanId}
                  onChange={(e) => setDraftPlanId(Number(e.target.value))}
                >
                  {assignableProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectInput>
              )}
            </Field>

            <div style={{ display: 'grid', gap: '0.65rem', maxBlockSize: '42dvh', overflowY: 'auto', paddingInlineEnd: '0.25rem' }}>
              {data.features.map((f) => (
                <div
                  key={f.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    padding: '0.55rem 0.75rem',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-control)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{f.name}</div>
                    <div className="mono-url text-muted" style={{ fontSize: '0.75rem' }}>
                      {f.key}
                    </div>
                  </div>
                  <SelectInput
                    aria-label={`${f.key} para ${editingUser.email}`}
                    style={{ width: 'auto', minWidth: '8.5rem', minBlockSize: 40 }}
                    value={draftOverrides[f.key] ?? 'inherit'}
                    onChange={(e) =>
                      setDraftOverrides((prev) => ({
                        ...prev,
                        [f.key]: e.target.value as OverrideValue,
                      }))
                    }
                  >
                    <option value="inherit">Herdar perfil</option>
                    <option value="allow">Liberar</option>
                    <option value="deny">Bloquear</option>
                  </SelectInput>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <Button size="sm" onClick={() => setEditingUser(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={savingUser}>
                {savingUser ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
