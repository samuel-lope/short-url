import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, ExternalLink, Link2, Plus, QrCode, Search, Settings, Shield, Shuffle } from 'lucide-react';
import type { LinkSummary, OverviewData, PaginationMeta } from '../../../shared/contracts.ts';
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
  SelectInput,
  Skeleton,
  StatTile,
  TextInput,
  Tile,
} from '../../shared/ui/index.ts';

export function DashboardPage() {
  const { user, features, hasFeature } = useAuth();
  const [links, setLinks] = useState<LinkSummary[]>([]);
  const [overview, setOverview] = useState<OverviewData['summary'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'static' | 'dynamic'>('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });

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
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (appliedQuery) params.set('q', appliedQuery);
      if (modeFilter !== 'all') params.set('mode', modeFilter);

      const linksRes = await apiRequest<{
        links: LinkSummary[];
        pagination?: PaginationMeta;
      }>(`/api/links?${params.toString()}`);
      setLinks(linksRes.links);
      if (linksRes.pagination) {
        setPagination(linksRes.pagination);
      }
      if (hasFeature('analytics.basic')) {
        const ovRes = await apiRequest<OverviewData>('/api/analytics/overview');
        setOverview(ovRes.summary);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar painel.');
    } finally {
      setLoading(false);
    }
  }, [hasFeature, page, appliedQuery, modeFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedQuery(searchInput.trim());
  };

  const resetFilters = () => {
    setSearchInput('');
    setAppliedQuery('');
    setModeFilter('all');
    setPage(1);
  };

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

  const createLimit = features['links.create']?.limit;
  const hasActiveFilter = Boolean(searchInput || appliedQuery || modeFilter !== 'all');

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
        <div className="mb-md">
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
          <search>
            <form onSubmit={handleSearchSubmit} className="toolbar-row">
              <label htmlFor="links-search" className="visually-hidden">
                Buscar links
              </label>
              <TextInput
                id="links-search"
                type="search"
                enterKeyHint="search"
                placeholder="Buscar por apelido, slug ou URL..."
                className="search-input"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <label htmlFor="links-mode-filter" className="visually-hidden">
                Filtrar por tipo
              </label>
              <SelectInput
                id="links-mode-filter"
                className="select--compact"
                value={modeFilter}
                onChange={(e) => {
                  setPage(1);
                  setModeFilter(e.target.value as 'all' | 'static' | 'dynamic');
                }}
              >
                <option value="all">Todos os tipos</option>
                <option value="dynamic">Dinâmicos</option>
                <option value="static">Estáticos</option>
              </SelectInput>
              <Button type="submit" size="sm">
                <Search size={14} aria-hidden="true" />
                <span>Filtrar</span>
              </Button>
              {hasActiveFilter && (
                <Button size="sm" variant="ghost" onClick={resetFilters}>
                  Limpar
                </Button>
              )}
            </form>
          </search>

          {loading ? (
            <Skeleton rows={4} />
          ) : links.length === 0 ? (
            <EmptyState
              icon={<Link2 size={28} aria-hidden="true" />}
              title={appliedQuery || modeFilter !== 'all' ? 'Nenhum link encontrado para este filtro' : 'Nenhum link criado ainda'}
              description={
                appliedQuery || modeFilter !== 'all'
                  ? 'Tente limpar a busca ou alterar o filtro de tipo.'
                  : 'Crie seu primeiro short link para gerenciar destinos dinâmicos, QR Codes e métricas de uso.'
              }
              action={
                appliedQuery || modeFilter !== 'all' ? (
                  <Button size="sm" onClick={resetFilters}>
                    Limpar filtros
                  </Button>
                ) : (
                  <FeatureGate feature="links.create">
                    <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                      <Plus size={16} aria-hidden="true" />
                      <span>Criar primeiro link</span>
                    </Button>
                  </FeatureGate>
                )
              }
            />
          ) : (
            <>
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
                          <div className="mono-url meta-text-xs">
                            <a href={item.shortUrl} target="_blank" rel="noreferrer">
                              {item.shortUrl} <ExternalLink size={12} aria-hidden="true" />
                            </a>
                          </div>
                        </th>
                        <td data-label="Tipo">
                          <div className="cluster-xs">
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
                            {!item.isActive && <Badge tone="danger">Pausado</Badge>}
                          </div>
                        </td>
                        <td data-label="Destino Ativo">
                          {item.activeTargetLabel && (
                            <div className="meta-strong">{item.activeTargetLabel}</div>
                          )}
                          <div className="mono-url text-muted truncate-url">
                            {item.activeTargetUrl || item.longUrl}
                          </div>
                        </td>
                        <td data-label="Uso">
                          <strong>{item.totalClicks}</strong> cliques
                          {item.qrScanCount !== null && (
                            <div className="text-muted meta-text-xs">
                              {item.qrScanCount} scans QR
                            </div>
                          )}
                        </td>
                        <td data-label="Ações">
                          <div className="cluster">
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
              {pagination.totalPages > 1 && (
                <div className="cluster-between">
                  <span className="text-muted meta-text">
                    Página {pagination.page} de {pagination.totalPages} ({pagination.total} links)
                  </span>
                  <div className="cluster">
                    <Button
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft size={14} aria-hidden="true" />
                      <span>Anterior</span>
                    </Button>
                    <Button
                      size="sm"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <span>Próxima</span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Tile>

        <Tile c={1} variant="muted" title="Seu Perfil" subtitle={user?.email}>
          {createLimit !== null && createLimit !== undefined && (
            <div className="quota-bar">
              Cota de links:{' '}
              <strong>
                {overview?.totalLinks ?? pagination.total} / {createLimit}
              </strong>
            </div>
          )}
          <div className="cluster-xs">
            {enabledFeatures.map((key) => (
              <Badge key={key} tone="neutral">
                {key}
              </Badge>
            ))}
          </div>
          {isAdmin && (
            <div className="push-end">
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
                <>
                  <TextInput
                    id={inputId}
                    type="text"
                    placeholder="meu-link"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value)}
                  />
                  {customSlug.trim() && (
                    <div className="slug-preview">
                      {window.location.origin}/{customSlug.trim()}
                    </div>
                  )}
                </>
              )}
            </Field>
          </FeatureGate>

          {createError && <Alert tone="error">{createError}</Alert>}

          <div className="modal-actions">
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
