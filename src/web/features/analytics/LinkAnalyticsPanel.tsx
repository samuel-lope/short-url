import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api.ts';
import { FeatureGate, LockedFeatureNotice } from '../../shared/FeatureGate.tsx';

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

function BreakdownBars({ title, items }: { title: string; items: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="y2k-card-sm">
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 900, textTransform: 'uppercase' }}>{title}</h3>
      {items.length === 0 ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Sem registros ainda.</div>
      ) : (
        items.map((item) => (
          <div key={item.label} className="bar-row">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${Math.round((item.count / max) * 100)}%` }} />
            </div>
            <strong style={{ textAlign: 'right' }}>{item.count}</strong>
          </div>
        ))
      )}
    </div>
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
        <div className="y2k-card-sm">Carregando métricas...</div>
      ) : error ? (
        <div className="alert-error" role="alert">
          {error}
        </div>
      ) : data ? (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <div className="stats-grid">
            <div className="y2k-card-sm">
              <div className="stat-label">Cliques Totais</div>
              <div className="stat-value">{data.link.totalClicks}</div>
            </div>
            <div className="y2k-card-sm">
              <div className="stat-label">Visitantes Únicos (Dia)</div>
              <div className="stat-value">{data.totals?.uniqueVisitors ?? 0}</div>
            </div>
            <div className="y2k-card-sm">
              <div className="stat-label">Cliques por Link</div>
              <div className="stat-value">{data.totals?.linkClicks ?? 0}</div>
            </div>
            <div className="y2k-card-sm y2k-card-mint">
              <div className="stat-label">Scans de QR Code</div>
              <div className="stat-value">{data.totals?.qrScans ?? 0}</div>
            </div>
          </div>

          <div className="split-grid">
            <BreakdownBars
              title="Acessos por Dia (30 dias)"
              items={data.dailySeries.map((d) => ({ label: d.day, count: d.total }))}
            />
            <BreakdownBars
              title="Acessos por Destino Dinâmico"
              items={data.byTarget.map((t) => ({ label: t.label, count: t.clicksCount }))}
            />
          </div>

          {data.detailedLocked ? (
            <LockedFeatureNotice
              feature="analytics.detailed"
              title="Analytics Detalhado (País, Dispositivo, OS, Referer)"
              description="Libere a funcionalidade 'analytics.detailed' para visualizar geolocalização, dispositivos, sistemas operacionais e log de acessos."
            />
          ) : (
            data.detailed && (
              <>
                <div className="split-grid">
                  <BreakdownBars title="Países" items={data.detailed.byCountry} />
                  <BreakdownBars title="Dispositivos" items={data.detailed.byDevice} />
                  <BreakdownBars title="Sistemas Operacionais" items={data.detailed.byOs} />
                  <BreakdownBars title="Origens (Referer)" items={data.detailed.byReferer} />
                </div>

                <div className="y2k-card-sm">
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 900, textTransform: 'uppercase' }}>
                    Últimos Acessos Registrados
                  </h3>
                  <div tabIndex={0} role="region" aria-label="Últimos acessos" className="table-wrapper">
                    <table className="y2k-table">
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
                              <span className={`tag ${ev.source === 'qr' ? 'tag-mint' : 'tag-muted'}`}>{ev.source}</span>
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
                </div>
              </>
            )
          )}
        </div>
      ) : null}
    </FeatureGate>
  );
}
