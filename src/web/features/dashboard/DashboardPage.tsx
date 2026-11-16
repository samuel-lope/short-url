import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BarChart3, ExternalLink, Link2, Plus, QrCode, Settings, Shield, Shuffle } from 'lucide-react';
import { useAuth } from '../../app/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import { CopyButton } from '../../shared/CopyButton.tsx';
import { FeatureGate } from '../../shared/FeatureGate.tsx';
import { Modal } from '../../shared/Modal.tsx';
import {
  Alert,
  Badge,
  BentoGrid,
  Button,
  ButtonLink,
  ChoiceGroup,
  EmptyState,
  Field,
  PageHeader,
  Skeleton,
  StatTile,
  TextInput,
  Tile,
} from '../../shared/ui/index.ts';

interface LinkSummary {
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
}

interface OverviewData {
  summary: {
    totalLinks: number;
    totalClicks: number;
    dynamicLinks: number;
    totalQrCodes: number;
    totalScans: number;
  };
}

export function DashboardPage() {
  const { user, features, hasFeature } = useAuth();
  const [links, setLinks] = useState<LinkSummary[]>([]);
  const [overview, setOverview] = useState<OverviewData['summary'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [mode, setMode] = useState<'static' | 'dynamic'>('dynamic');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const linksRes = await apiRequest<{ links: LinkSummary[] }>('/api/links');
      setLinks(linksRes.links);
      if (hasFeature('analytics.basic')) {
        const ovRes = await apiRequest<OverviewData>('/api/analytics/overview');
        setOverview(ovRes.summary);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar painel.');
    } finally {
      setLoading(false);
    }
  }, [hasFeature]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setSubmitting(true);
    try {
      await apiRequest('/api/links', {
        method: 'POST',
        body: JSON.stringify({
          url,
          title: title || undefined,
          customSlug: customSlug || undefined,
          mode: hasFeature('url.dynamic_switch') ? mode : 'static',
        }),
      });
      setUrl('');
      setTitle('');
      setCustomSlug('');
      setCreateOpen(false);
      await loadData();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erro ao criar link.');
    } finally {
      setSubmitting(false);
    }
  };

  const enabledFeatures = Object.entries(features)
    .filter(([, cap]) => cap.enabled)
    .map(([key]) => key);

  const isAdmin = Boolean(
    user && (user.role === 'admin' || user.plan.hasFullAccess || hasFeature('admin.profiles'))
  );

  return (
    <div>
      <PageHeader
        title="Painel de Controle"
        subtitle={
          <>
            Perfil ativo: <strong>{user?.plan.name}</strong> · {enabledFeatures.length} funcionalidades liberadas
          </>
        }
        actions={
          <FeatureGate feature="links.create">
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={18} aria-hidden="true" />
              <span>Novo Link</span>
            </Button>
          </FeatureGate>
        }
      />

      {error && (
        <div style={{ marginBottom: '1rem' }}>
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <BentoGrid cols={4} label="Visão geral e lista de links">
        <StatTile
          label="Links criados"
          value={overview?.totalLinks ?? links.length}
          icon={<Link2 size={16} aria-hidden="true" />}
        />
        <StatTile
          label="Cliques totais"
          value={overview?.totalClicks ?? 0}
          variant="accent"
          icon={<BarChart3 size={16} aria-hidden="true" />}
        />
        <StatTile
          label="Links dinâmicos"
          value={overview?.dynamicLinks ?? links.filter((l) => l.mode === 'dynamic').length}
          icon={<Shuffle size={16} aria-hidden="true" />}
        />
        <StatTile
          label="Scans de QR"
          value={overview?.totalScans ?? 0}
          icon={<QrCode size={16} aria-hidden="true" />}
        />

        <Tile c={3} r={2} title="Seus Short Links" aria-labelledby="links-table-heading">
          {loading ? (
            <Skeleton rows={4} />
          ) : links.length === 0 ? (
            <EmptyState
              icon={<Link2 size={28} aria-hidden="true" />}
              title="Nenhum link criado ainda"
              description="Crie seu primeiro short link para gerenciar destinos dinâmicos, QR Codes e métricas de uso."
              action={
                <FeatureGate feature="links.create">
                  <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus size={16} aria-hidden="true" />
                    <span>Criar primeiro link</span>
                  </Button>
                </FeatureGate>
              }
            />
          ) : (
            <div tabIndex={0} role="region" aria-label="Tabela de links" className="table-wrapper">
              <table className="bento-table">
                <thead>
                  <tr>
                    <th>Short URL</th>
                    <th>Tipo</th>
                    <th>Destino Ativo</th>
                    <th>Uso</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((item) => (
                    <tr key={item.id}>
                      <th scope="row">
                        <div>{item.title || item.shortCode}</div>
                        <div className="mono-url" style={{ fontSize: '0.82rem', fontWeight: 400 }}>
                          <a href={item.shortUrl} target="_blank" rel="noreferrer">
                            {item.shortUrl} <ExternalLink size={12} aria-hidden="true" />
                          </a>
                        </div>
                      </th>
                      <td data-label="Tipo">
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          <Badge tone={item.mode === 'dynamic' ? 'accent' : 'neutral'}>
                            {item.mode === 'dynamic' ? (
                              <>
                                <Shuffle size={12} aria-hidden="true" />
                                <span>Dinâmico ({item.targetsCount})</span>
                              </>
                            ) : (
                              'Estático'
                            )}
                          </Badge>
                          {item.hasQr && (
                            <Badge tone="success">
                              <QrCode size={12} aria-hidden="true" />
                              <span>QR</span>
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td data-label="Destino Ativo">
                        {item.activeTargetLabel && (
                          <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{item.activeTargetLabel}</div>
                        )}
                        <div
                          className="mono-url text-muted"
                          style={{ fontSize: '0.8rem', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {item.activeTargetUrl || item.longUrl}
                        </div>
                      </td>
                      <td data-label="Uso">
                        <strong>{item.totalClicks}</strong> cliques
                        {item.qrScanCount !== null && (
                          <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                            {item.qrScanCount} scans QR
                          </div>
                        )}
                      </td>
                      <td data-label="Ações">
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <CopyButton text={item.shortUrl} label="Copiar" />
                          <ButtonLink to={`/app/links/${item.id}`} size="sm">
                            <Settings size={14} aria-hidden="true" />
                            <span>Gerenciar</span>
                          </ButtonLink>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tile>

        <Tile c={1} variant="muted" title="Seu Perfil" subtitle={user?.email}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {enabledFeatures.map((key) => (
              <Badge key={key} tone="neutral">
                {key}
              </Badge>
            ))}
          </div>
          {isAdmin && (
            <div style={{ marginTop: 'auto' }}>
              <ButtonLink to="/admin" variant="secondary" size="sm">
                <Shield size={15} aria-hidden="true" />
                <span>Console Admin</span>
              </ButtonLink>
            </div>
          )}
        </Tile>
      </BentoGrid>

      <Modal open={createOpen} title="Criar novo link" onClose={() => setCreateOpen(false)}>
        <form className="form-stack" onSubmit={handleCreate}>
          <Field label="URL de destino" htmlFor="modal-url" required>
            {({ inputId }) => (
              <TextInput
                id={inputId}
                type="url"
                placeholder="https://exemplo.com/destino"
                required
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            )}
          </Field>

          <Field label="Título / Apelido (opcional)" htmlFor="modal-title">
            {({ inputId }) => (
              <TextInput
                id={inputId}
                type="text"
                placeholder="Ex: Campanha Black Friday"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </Field>

          <FeatureGate feature="url.dynamic_switch">
            <ChoiceGroup
              legend="Modo do link"
              name="modalMode"
              type="radio"
              value={mode}
              onChange={(v) => setMode(v)}
              options={[
                { value: 'dynamic', label: 'Dinâmico' },
                { value: 'static', label: 'Estático' },
              ]}
            />
          </FeatureGate>

          <FeatureGate feature="links.custom_slug">
            <Field label="Slug personalizado (opcional)" htmlFor="modal-slug">
              {({ inputId }) => (
                <TextInput
                  id={inputId}
                  type="text"
                  placeholder="meu-link"
                  value={customSlug}
                  onChange={(e) => setCustomSlug(e.target.value)}
                />
              )}
            </Field>
          </FeatureGate>

          {createError && <Alert tone="error">{createError}</Alert>}

          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
            <Button size="sm" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={submitting}>
              {submitting ? 'Criando...' : 'Criar link'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
