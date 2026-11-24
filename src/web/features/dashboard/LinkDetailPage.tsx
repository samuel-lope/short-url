import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, ExternalLink, Pencil, QrCode, Shuffle, Trash2 } from 'lucide-react';
import type { LinkDetailResponse } from '../../../shared/contracts.ts';
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
  Field,
  Skeleton,
  TextInput,
  Tile,
} from '../../shared/ui/index.ts';
import { DynamicTargetsPanel } from '../dynamic-links/DynamicTargetsPanel.tsx';
import { DynamicQrPanel } from '../qr-codes/DynamicQrPanel.tsx';
import { LinkAnalyticsPanel } from '../analytics/LinkAnalyticsPanel.tsx';

type TabKey = 'targets' | 'qr' | 'analytics';
const TAB_KEYS: TabKey[] = ['targets', 'qr', 'analytics'];

export function LinkDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkId = Number(id);

  const rawTab = searchParams.get('tab');
  const activeTab: TabKey =
    rawTab && (TAB_KEYS as readonly string[]).includes(rawTab) ? (rawTab as TabKey) : 'targets';

  const setActiveTab = (next: TabKey) => {
    setSearchParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        updated.set('tab', next);
        return updated;
      },
      { replace: true }
    );
  };

  const [data, setData] = useState<LinkDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editMode, setEditMode] = useState<'static' | 'dynamic'>('static');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
    setTogglingActive(true);
    setActionError(null);
    try {
      await apiRequest(`/api/links/${data.link.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !data.link.isActive }),
      });
      await loadDetail();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao atualizar status do link.');
    } finally {
      setTogglingActive(false);
    }
  };

  const openEditModal = () => {
    if (!data) return;
    setEditTitle(data.link.title ?? '');
    setEditUrl(data.link.longUrl);
    setEditMode(data.link.mode);
    setEditError(null);
    setEditOpen(true);
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await apiRequest(`/api/links/${data.link.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTitle || null,
          url: editUrl,
          mode: editMode,
        }),
      });
      setEditOpen(false);
      await loadDetail();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Erro ao atualizar link.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!data) return;
    setDeleting(true);
    setActionError(null);
    try {
      await apiRequest(`/api/links/${data.link.id}`, { method: 'DELETE' });
      navigate('/app');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao excluir link.');
      setConfirmDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
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

  if (loading) {
    return (
      <Tile c={4}>
        <Skeleton rows={4} />
      </Tile>
    );
  }
  if (error || !data) {
    return <Alert tone="error">{error ?? 'Link não encontrado.'}</Alert>;
  }

  return (
    <div className="stack-md">
      <div>
        <ButtonLink to="/app" variant="ghost" size="sm">
          <ArrowLeft size={15} aria-hidden="true" />
          <span>Voltar ao Painel</span>
        </ButtonLink>
      </div>

      {actionError && <Alert tone="error">{actionError}</Alert>}

      <BentoGrid cols={4} label="Detalhes do link">
        <Tile c={3} as="section" aria-labelledby="link-detail-title">
          <div className="cluster-xs">
            <Badge tone={data.link.mode === 'dynamic' ? 'accent' : 'neutral'}>
              {data.link.mode === 'dynamic' ? 'URL Dinâmica' : 'URL Estática'}
            </Badge>
            <Badge tone={data.link.isActive ? 'success' : 'danger'}>
              {data.link.isActive ? 'Ativo' : 'Pausado'}
            </Badge>
            <Badge>{data.link.totalClicks} cliques</Badge>
          </div>

          <div className="stack-xs">
            <h1 id="link-detail-title" className="page-title">
              {data.link.title || data.link.shortCode}
            </h1>
            <div className="mono-url url-featured">
              <a href={data.link.shortUrl} target="_blank" rel="noreferrer">
                {data.link.shortUrl} <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
            <div className="mono-url text-muted meta-text">
              Fallback padrão: {data.link.longUrl}
            </div>
          </div>

          <div className="cluster push-end">
            <CopyButton text={data.link.shortUrl} label="Copiar URL" />
            <Button size="sm" onClick={openEditModal} disabled={togglingActive || deleting}>
              <Pencil size={14} aria-hidden="true" />
              <span>Editar</span>
            </Button>
            <Button size="sm" onClick={handleToggleActive} disabled={togglingActive || deleting}>
              {togglingActive ? 'Atualizando...' : data.link.isActive ? 'Pausar Link' : 'Reativar Link'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={togglingActive || deleting}
              onClick={() => {
                setActionError(null);
                setConfirmDeleteOpen(true);
              }}
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>Excluir</span>
            </Button>
          </div>
        </Tile>

        <Tile
          c={1}
          variant="muted"
          title="QR & Destinos"
          subtitle={`${data.targets.length} destino(s) configurado(s)`}
        >
          <div className="meta-text">
            <div>
              Scans QR: <strong>{data.qrCode?.scanCount ?? 0}</strong>
            </div>
          </div>
          <div className="push-end">
            <Button size="sm" onClick={() => setActiveTab('qr')}>
              <QrCode size={15} aria-hidden="true" />
              <span>Abrir QR Code</span>
            </Button>
          </div>
        </Tile>

        <Tile c={4}>
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
              <Shuffle size={15} aria-hidden="true" />
              <span>Destinos Dinâmicos</span>
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
              <QrCode size={15} aria-hidden="true" />
              <span>QR Code Dinâmico</span>
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
              <BarChart3 size={15} aria-hidden="true" />
              <span>Registro de Uso</span>
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
            {activeTab === 'analytics' && (
              <LinkAnalyticsPanel linkId={data.link.id} shortUrl={data.link.shortUrl} />
            )}
          </div>
        </Tile>
      </BentoGrid>

      <Modal open={editOpen} title="Editar link" onClose={() => setEditOpen(false)}>
        <form className="form-stack" onSubmit={handleSaveEdit}>
          <Field label="Título / Apelido" htmlFor="edit-link-title">
            {({ inputId }) => (
              <TextInput
                id={inputId}
                type="text"
                maxLength={120}
                placeholder="Ex: Campanha Principal"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            )}
          </Field>

          <Field label="URL padrão (fallback)" htmlFor="edit-link-url" required>
            {({ inputId }) => (
              <TextInput
                id={inputId}
                type="url"
                required
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
              />
            )}
          </Field>

          <FeatureGate feature="url.dynamic_switch">
            <ChoiceGroup
              legend="Modo do link"
              name="editLinkMode"
              type="radio"
              value={editMode}
              onChange={(v) => setEditMode(v)}
              options={[
                { value: 'static', label: 'Estático' },
                { value: 'dynamic', label: 'Dinâmico' },
              ]}
            />
          </FeatureGate>

          {editError && <Alert tone="error">{editError}</Alert>}

          <div className="modal-actions">
            <Button size="sm" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={savingEdit}>
              {savingEdit ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={confirmDeleteOpen} title="Excluir link?" onClose={() => setConfirmDeleteOpen(false)}>
        <p className="mt-none">
          Esta ação apagará permanentemente o link <strong className="mono-url">{data.link.shortUrl}</strong>, seus destinos dinâmicos, QR Code e histórico de uso.
        </p>
        <div className="modal-actions">
          <Button size="sm" autoFocus disabled={deleting} onClick={() => setConfirmDeleteOpen(false)}>
            Cancelar
          </Button>
          <Button variant="danger" size="sm" disabled={deleting} onClick={handleDelete}>
            {deleting ? 'Excluindo...' : 'Confirmar exclusão'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
