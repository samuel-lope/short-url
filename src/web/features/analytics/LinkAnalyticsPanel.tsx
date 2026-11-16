import { useEffect, useState } from 'react';
import { BarChart3, Link2, QrCode, Users } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { FeatureGate, LockedFeatureNotice } from '../../shared/FeatureGate.tsx';
import { Alert, Badge, BentoGrid, Skeleton, StatTile, Tile } from '../../shared/ui/index.ts';

interface AnalyticsData {
  link: { id: number; shortCode: string; title: string | null; totalClicks: number };
  totals: { recordedEvents: number; uniqueVisitors: number; qrScans: number; linkClicks: number };
  dailySeries: Array<{ day: string; total: number; qrScans: number; linkClicks: number }>;
  byTarget: Array<{ id: number; label: string; targetUrl: string; clicksCount: number }>;
  detailedLocked: boolean;
  detailed: {
    byCountry: Array<{ label: string; count: number }>;
    byDevice: Array<{ label: string; count: number }>;
    byOs: Array<{ label: string; count: number }>;
    byReferer: Array<{ label: string; count: number }>;
    recentEvents: Array<{
      id: number;
      source: string;
      clickedAt: number;
      country: string | null;
      city: string | null;
      deviceType: string | null;
      os: string | null;
      browser: string | null;
      referer: string | null;
    }>;
  } | null;
}

function BreakdownTile({
  title,
  items,
  c = 1,
}: {
  title: string;
  items: Array<{ label: string; count: number }>;
  c?: 1 | 2 | 4;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <Tile c={c} title={title}>
      {items.length === 0 ? (
        <div className="text-muted" style={{ fontSize: '0.86rem' }}>
          Sem registros ainda.
        </div>
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

export function LinkAnalyticsPanel({ linkId }: { linkId: number }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiRequest<AnalyticsData>(`/api/analytics/links/${linkId}`);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar métricas.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [linkId]);

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
      ) : null}
    </FeatureGate>
  );
}
