import { useCallback, useEffect, useState } from 'react';
import { BarChart3, ExternalLink, Link2, QrCode, RefreshCw, Users } from 'lucide-react';
import type { AnalyticsBreakdownItem, AnalyticsData } from '../../../shared/contracts.ts';
import { apiRequest } from '../../lib/api.ts';
import { FeatureGate, LockedFeatureNotice } from '../../shared/FeatureGate.tsx';
import { Alert, Badge, BentoGrid, Button, EmptyState, Skeleton, StatTile, Tile } from '../../shared/ui/index.ts';

function BreakdownTile({
  title,
  items,
  c = 1,
}: {
  title: string;
  items: AnalyticsBreakdownItem[];
  c?: 1 | 2 | 4;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <Tile c={c} title={title}>
      {items.length === 0 ? (
        <div className="text-muted meta-text">Sem registros ainda.</div>
      ) : (
        <div>
          {items.map((item) => (
            <div key={item.label} className="bar-row">
              <span className="bar-label" title={item.label}>
                {item.label}
              </span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.round((item.count / max) * 100)}%` }} />
              </div>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      )}
    </Tile>
  );
}

export function LinkAnalyticsPanel({ linkId, shortUrl }: { linkId: number; shortUrl?: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(
    async (signal?: AbortSignal) => {
      setError(null);
      try {
        const res = await apiRequest<AnalyticsData>(`/api/analytics/links/${linkId}`, {
          signal,
        });
        if (!signal?.aborted) setData(res);
      } catch (err) {
        if (!signal?.aborted) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar métricas.');
        }
      }
    },
    [linkId]
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void loadAnalytics(controller.signal).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => {
      controller.abort();
    };
  }, [loadAnalytics]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAnalytics();
    setRefreshing(false);
  };

  return (
    <FeatureGate
      feature="analytics.basic"
      fallback={<LockedFeatureNotice feature="analytics.basic" title="Registro de Uso bloqueado" />}
    >
      {loading ? (
        <Tile c={4}>
          <Skeleton rows={4} />
        </Tile>
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : data ? (
        data.link.totalClicks === 0 ? (
          <BentoGrid cols={4} label="Registro de uso">
            <Tile c={4} variant="muted">
              <EmptyState
                icon={<BarChart3 size={28} aria-hidden="true" />}
                title="Nenhum clique registrado ainda"
                description="Este link ainda não recebeu acessos. Teste o link curto abaixo e atualize para conferir os primeiros registros."
                action={
                  <div className="cluster cluster-center">
                    {shortUrl && (
                      <a
                        className="btn btn--primary btn--sm"
                        href={shortUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink size={14} aria-hidden="true" />
                        <span>Testar short link</span>
                      </a>
                    )}
                    <Button size="sm" onClick={handleRefresh} disabled={refreshing}>
                      <RefreshCw size={14} aria-hidden="true" />
                      <span>{refreshing ? 'Atualizando...' : 'Atualizar'}</span>
                    </Button>
                  </div>
                }
              />
            </Tile>
          </BentoGrid>
        ) : (
          <div className="stack-md">
            <div className="cluster-between">
              <span className="text-muted meta-text">Métricas de cliques e acessos por QR Code</span>
              <Button size="sm" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw size={14} aria-hidden="true" />
                <span>{refreshing ? 'Atualizando...' : 'Atualizar'}</span>
              </Button>
            </div>

            <BentoGrid cols={4} label="Registro de uso">
          <StatTile
            label="Cliques totais"
            value={data.link.totalClicks}
            icon={<BarChart3 size={16} aria-hidden="true" />}
          />
          <StatTile
            label="Visitantes únicos (dia)"
            value={data.totals?.uniqueVisitors ?? 0}
            icon={<Users size={16} aria-hidden="true" />}
          />
          <StatTile
            label="Cliques por link"
            value={data.totals?.linkClicks ?? 0}
            icon={<Link2 size={16} aria-hidden="true" />}
          />
          <StatTile
            label="Scans de QR Code"
            value={data.totals?.qrScans ?? 0}
            variant="accent"
            icon={<QrCode size={16} aria-hidden="true" />}
          />

          <BreakdownTile
            c={2}
            title="Acessos por dia (30 dias)"
            items={data.dailySeries.map((d) => ({ label: d.day, count: d.total }))}
          />
          <BreakdownTile
            c={2}
            title="Acessos por destino dinâmico"
            items={data.byTarget.map((t) => ({ label: t.label, count: t.clicksCount }))}
          />

          {data.detailedLocked ? (
            <LockedFeatureNotice
              feature="analytics.detailed"
              title="Analytics Detalhado (País, Dispositivo, OS, Referer)"
              description="Libere a funcionalidade 'analytics.detailed' para visualizar geolocalização, dispositivos, sistemas operacionais e log de acessos."
            />
          ) : (
            data.detailed && (
              <>
                <BreakdownTile title="Países" items={data.detailed.byCountry} />
                <BreakdownTile title="Dispositivos" items={data.detailed.byDevice} />
                <BreakdownTile title="Sistemas" items={data.detailed.byOs} />
                <BreakdownTile title="Origens" items={data.detailed.byReferer} />

                <Tile c={4} title="Últimos acessos registrados">
                  <div tabIndex={0} role="region" aria-label="Últimos acessos" className="table-wrapper">
                    <table className="bento-table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Origem</th>
                          <th>País</th>
                          <th>Dispositivo / OS</th>
                          <th>Referer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.detailed.recentEvents.map((ev) => (
                          <tr key={ev.id}>
                            <td data-label="Data">{new Date(ev.clickedAt * 1000).toLocaleString('pt-BR')}</td>
                            <td data-label="Origem">
                              <Badge tone={ev.source === 'qr' ? 'accent' : 'neutral'}>{ev.source}</Badge>
                            </td>
                            <td data-label="País">{ev.country ?? '—'}</td>
                            <td data-label="Dispositivo / OS">
                              {ev.deviceType} · {ev.os} ({ev.browser})
                            </td>
                            <td data-label="Referer">{ev.referer ?? 'Direto'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Tile>
              </>
            )
          )}
        </BentoGrid>
          </div>
        )
      ) : null}
    </FeatureGate>
  );
}
