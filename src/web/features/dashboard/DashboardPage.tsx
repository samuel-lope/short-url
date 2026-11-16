import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Plus, QrCode, Settings, Shuffle } from 'lucide-react';
import { useAuth } from '../../app/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import { CopyButton } from '../../shared/CopyButton.tsx';
import { FeatureGate } from '../../shared/FeatureGate.tsx';
import { Modal } from '../../shared/Modal.tsx';

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

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '0.35rem' }}>
            Painel de Controle
          </h1>
          <div style={{ fontSize: '0.88rem' }}>
            Plano: <strong>{user?.plan.name}</strong> · Recursos ativos:{' '}
            <strong>{enabledFeatures.length}</strong>
          </div>
        </div>

        <FeatureGate feature="links.create">
          <button type="button" className="neo-btn neo-btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={18} aria-hidden="true" />
            <span>Novo Link</span>
          </button>
        </FeatureGate>
      </div>

      {overview && (
        <section className="stats-grid" aria-label="Resumo de uso">
          <div className="neo-card-sm">
            <div className="stat-label">Links Criados</div>
            <div className="stat-value">{overview.totalLinks}</div>
          </div>
          <div className="neo-card-sm neo-card-mint">
            <div className="stat-label">Cliques Totais</div>
            <div className="stat-value">{overview.totalClicks}</div>
          </div>
          <div className="neo-card-sm">
            <div className="stat-label">Links Dinâmicos</div>
            <div className="stat-value">{overview.dynamicLinks}</div>
          </div>
          <div className="neo-card-sm neo-card-yellow">
            <div className="stat-label">Scans de QR</div>
            <div className="stat-value">{overview.totalScans}</div>
          </div>
        </section>
      )}

      {error && (
        <div className="alert-error" role="alert">
          {error}
        </div>
      )}

      <section aria-labelledby="links-table-heading">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 id="links-table-heading" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, textTransform: 'uppercase' }}>
            Seus Short Links
          </h2>
        </div>

        {loading ? (
          <div className="neo-card-sm">Carregando links...</div>
        ) : links.length === 0 ? (
          <div className="neo-card-sm">
            Você ainda não criou nenhum link na sua conta. Clique em <strong>Novo Link</strong> para começar.
          </div>
        ) : (
          <div tabIndex={0} role="region" aria-labelledby="links-table-heading" className="table-wrapper">
            <table className="neo-table">
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
                      <div style={{ fontWeight: 900 }}>{item.title || item.shortCode}</div>
                      <div style={{ fontSize: '0.84rem', wordBreak: 'break-all' }}>
                        <a href={item.shortUrl} target="_blank" rel="noreferrer">
                          {item.shortUrl} <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      </div>
                    </th>
                    <td data-label="Tipo">
                      <span className={`tag ${item.mode === 'dynamic' ? 'tag-purple' : 'tag-muted'}`}>
                        {item.mode === 'dynamic' ? (
                          <>
                            <Shuffle size={12} aria-hidden="true" />
                            <span>Dinâmico ({item.targetsCount})</span>
                          </>
                        ) : (
                          'Estático'
                        )}
                      </span>
                      {item.hasQr && (
                        <span className="tag tag-mint" style={{ marginLeft: '0.35rem' }}>
                          <QrCode size={12} aria-hidden="true" />
                          <span>QR</span>
                        </span>
                      )}
                    </td>
                    <td data-label="Destino Ativo">
                      {item.activeTargetLabel && (
                        <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>{item.activeTargetLabel}</div>
                      )}
                      <div style={{ fontSize: '0.84rem', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.activeTargetUrl || item.longUrl}
                      </div>
                    </td>
                    <td data-label="Uso">
                      <strong>{item.totalClicks}</strong> cliques
                      {item.qrScanCount !== null && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{item.qrScanCount} scans QR</div>
                      )}
                    </td>
                    <td data-label="Ações">
                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <CopyButton text={item.shortUrl} label="Copiar" />
                        <Link to={`/app/links/${item.id}`} className="neo-btn neo-btn-sm neo-btn-yellow">
                          <Settings size={14} aria-hidden="true" />
                          <span>Gerenciar</span>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={createOpen} title="Criar Novo Link" onClose={() => setCreateOpen(false)}>
        <form className="form-stack" onSubmit={handleCreate}>
          <div className="field">
            <label htmlFor="modal-url" className="field-label">
              URL de Destino
            </label>
            <input
              id="modal-url"
              type="url"
              className="neo-input"
              placeholder="https://exemplo.com/destino"
              required
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="modal-title" className="field-label">
              Título / Apelido (Opcional)
            </label>
            <input
              id="modal-title"
              type="text"
              className="neo-input"
              placeholder="Ex: Campanha Black Friday"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <FeatureGate feature="url.dynamic_switch">
            <fieldset style={{ border: '2px solid var(--ink)', padding: '0.65rem', margin: 0 }}>
              <legend className="field-label">Modo do Link</legend>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <input type="radio" name="modalMode" checked={mode === 'dynamic'} onChange={() => setMode('dynamic')} />
                  <span>Dinâmico</span>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <input type="radio" name="modalMode" checked={mode === 'static'} onChange={() => setMode('static')} />
                  <span>Estático</span>
                </label>
              </div>
            </fieldset>
          </FeatureGate>

          <FeatureGate feature="links.custom_slug">
            <div className="field">
              <label htmlFor="modal-slug" className="field-label">
                Slug Personalizado (Opcional)
              </label>
              <input
                id="modal-slug"
                type="text"
                className="neo-input"
                placeholder="meu-link"
                value={customSlug}
                onChange={(e) => setCustomSlug(e.target.value)}
              />
            </div>
          </FeatureGate>

          {createError && (
            <div className="alert-error" role="alert">
              {createError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
            <button type="button" className="neo-btn neo-btn-sm" onClick={() => setCreateOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="neo-btn neo-btn-primary neo-btn-sm" disabled={submitting}>
              {submitting ? 'Criando...' : 'Criar Link'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
