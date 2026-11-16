import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, ExternalLink, QrCode, Shuffle, Trash2 } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { CopyButton } from '../../shared/CopyButton.tsx';
import { Modal } from '../../shared/Modal.tsx';
import { DynamicTargetsPanel, type LinkTargetItem } from '../dynamic-links/DynamicTargetsPanel.tsx';
import { DynamicQrPanel } from '../qr-codes/DynamicQrPanel.tsx';
import { LinkAnalyticsPanel } from '../analytics/LinkAnalyticsPanel.tsx';
import type { QrStyle } from '../../../shared/contracts.ts';

interface LinkDetailResponse {
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
  };
  targets: LinkTargetItem[];
  qrCode: {
    id: number;
    scanCount: number;
    style: Partial<QrStyle>;
  } | null;
}

type TabKey = 'targets' | 'qr' | 'analytics';

const TAB_KEYS: TabKey[] = ['targets', 'qr', 'analytics'];

export function LinkDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const linkId = Number(id);

  const [data, setData] = useState<LinkDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('targets');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!Number.isInteger(linkId)) {
      setError('ID de link inválido.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<LinkDetailResponse>(`/api/links/${linkId}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar link.');
    } finally {
      setLoading(false);
    }
  }, [linkId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleToggleActive = async () => {
    if (!data) return;
    await apiRequest(`/api/links/${data.link.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !data.link.isActive }),
    });
    await loadDetail();
  };

  const handleDelete = async () => {
    if (!data) return;
    await apiRequest(`/api/links/${data.link.id}`, { method: 'DELETE' });
    navigate('/app');
  };

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key === 'ArrowRight') {
      const next = TAB_KEYS[(idx + 1) % TAB_KEYS.length];
      setActiveTab(next);
      document.getElementById(`tab-${next}`)?.focus();
    } else if (e.key === 'ArrowLeft') {
      const prev = TAB_KEYS[(idx - 1 + TAB_KEYS.length) % TAB_KEYS.length];
      setActiveTab(prev);
      document.getElementById(`tab-${prev}`)?.focus();
    }
  };

  if (loading) return <div className="y2k-card-sm">Carregando detalhes...</div>;
  if (error || !data) {
    return (
      <div className="alert-error" role="alert">
        {error ?? 'Link não encontrado.'}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div>
        <Link to="/app" className="y2k-btn y2k-btn-sm">
          <ArrowLeft size={15} aria-hidden="true" />
          <span>Voltar ao Painel</span>
        </Link>
      </div>

      <section className="y2k-window" aria-labelledby="link-detail-title">
        <div className="y2k-titlebar">
          <span>LINK_PROPS.EXE — /{data.link.shortCode}</span>
          <span className="y2k-titlebar-dots" aria-hidden="true">
            <span className="y2k-win-glyph">_</span>
            <span className="y2k-win-glyph">□</span>
          </span>
        </div>

        <div className="y2k-window-body" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div style={{ minWidth: 0, flex: '1 1 300px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.5rem' }}>
              <span className={`tag ${data.link.mode === 'dynamic' ? 'tag-purple' : 'tag-muted'}`}>
                {data.link.mode === 'dynamic' ? 'URL Dinâmica' : 'URL Estática'}
              </span>
              <span className={`tag ${data.link.isActive ? 'tag-mint' : 'tag-red'}`}>
                {data.link.isActive ? 'Ativo' : 'Pausado'}
              </span>
              <span className="tag">{data.link.totalClicks} cliques</span>
            </div>

            <h1 id="link-detail-title" className="page-title" style={{ marginBottom: '0.5rem' }}>
              {data.link.title || data.link.shortCode}
            </h1>

            <div className="mono-url" style={{ fontWeight: 900, fontSize: '1.02rem', marginBottom: '0.35rem' }}>
              <a href={data.link.shortUrl} target="_blank" rel="noreferrer">
                {data.link.shortUrl} <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
            <div className="mono-url" style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
              Fallback padrão: {data.link.longUrl}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <CopyButton text={data.link.shortUrl} label="Copiar URL" />
            <button type="button" className="y2k-btn y2k-btn-sm" onClick={handleToggleActive}>
              {data.link.isActive ? 'Pausar Link' : 'Reativar Link'}
            </button>
            <button
              type="button"
              className="y2k-btn y2k-btn-sm y2k-btn-danger"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>Excluir</span>
            </button>
          </div>
        </div>
      </section>

      <div className="y2k-card">
        <div role="tablist" aria-label="Gerenciamento do link" className="tablist">
          <button
            id="tab-targets"
            type="button"
            role="tab"
            className="tab-btn"
            aria-selected={activeTab === 'targets'}
            tabIndex={activeTab === 'targets' ? 0 : -1}
            onClick={() => setActiveTab('targets')}
            onKeyDown={(e) => handleTabKeyDown(e, 0)}
          >
            <Shuffle size={15} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Destinos Dinâmicos
          </button>

          <button
            id="tab-qr"
            type="button"
            role="tab"
            className="tab-btn"
            aria-selected={activeTab === 'qr'}
            tabIndex={activeTab === 'qr' ? 0 : -1}
            onClick={() => setActiveTab('qr')}
            onKeyDown={(e) => handleTabKeyDown(e, 1)}
          >
            <QrCode size={15} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }} />
            QR Code Dinâmico
          </button>

          <button
            id="tab-analytics"
            type="button"
            role="tab"
            className="tab-btn"
            aria-selected={activeTab === 'analytics'}
            tabIndex={activeTab === 'analytics' ? 0 : -1}
            onClick={() => setActiveTab('analytics')}
            onKeyDown={(e) => handleTabKeyDown(e, 2)}
          >
            <BarChart3 size={15} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Registro de Uso
          </button>
        </div>

        <div role="tabpanel" aria-labelledby="tab-targets" hidden={activeTab !== 'targets'}>
          {activeTab === 'targets' && (
            <DynamicTargetsPanel
              linkId={data.link.id}
              mode={data.link.mode}
              activeTargetId={data.link.activeTargetId}
              targets={data.targets}
              onRefresh={loadDetail}
            />
          )}
        </div>

        <div role="tabpanel" aria-labelledby="tab-qr" hidden={activeTab !== 'qr'}>
          {activeTab === 'qr' && (
            <DynamicQrPanel
              linkId={data.link.id}
              qrUrl={data.link.qrUrl}
              shortCode={data.link.shortCode}
              initialQr={data.qrCode}
              onSaved={loadDetail}
            />
          )}
        </div>

        <div role="tabpanel" aria-labelledby="tab-analytics" hidden={activeTab !== 'analytics'}>
          {activeTab === 'analytics' && <LinkAnalyticsPanel linkId={data.link.id} />}
        </div>
      </div>

      <Modal open={confirmDeleteOpen} title="Excluir Link?" onClose={() => setConfirmDeleteOpen(false)}>
        <p style={{ marginTop: 0 }}>
          Esta ação apagará permanentemente o link <strong>{data.link.shortUrl}</strong>, seus destinos dinâmicos, QR Code e histórico de uso.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
          <button
            type="button"
            className="y2k-btn y2k-btn-sm"
            autoFocus
            onClick={() => setConfirmDeleteOpen(false)}
          >
            Cancelar
          </button>
          <button type="button" className="y2k-btn y2k-btn-sm y2k-btn-danger" onClick={handleDelete}>
            Confirmar exclusão
          </button>
        </div>
      </Modal>
    </div>
  );
}
