import { useState, type FormEvent } from 'react';
import { CheckCircle2, Plus, Shuffle, Trash2 } from 'lucide-react';
import type { RuleConfig, RuleType } from '../../../shared/contracts.ts';
import { useAuth } from '../../app/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import { FeatureGate, LockedFeatureNotice } from '../../shared/FeatureGate.tsx';

export interface LinkTargetItem {
  id: number;
  linkId: number;
  label: string;
  targetUrl: string;
  priority: number;
  ruleType: RuleType;
  ruleConfig: RuleConfig;
  isActive: boolean;
  clicksCount: number;
}

interface Props {
  linkId: number;
  mode: 'static' | 'dynamic';
  activeTargetId: number | null;
  targets: LinkTargetItem[];
  onRefresh: () => Promise<void>;
}

export function DynamicTargetsPanel({ linkId, mode, activeTargetId, targets, onRefresh }: Props) {
  const { hasFeature } = useAuth();
  const canConditional = hasFeature('url.conditional_rules');

  const [label, setLabel] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [ruleType, setRuleType] = useState<RuleType>('manual');
  const [priority, setPriority] = useState(0);
  const [setAsActive, setSetAsActive] = useState(true);

  // Conditional rule fields
  const [devices, setDevices] = useState<Array<'mobile' | 'tablet' | 'desktop'>>([]);
  const [osList, setOsList] = useState<Array<'iOS' | 'Android' | 'Windows' | 'macOS' | 'Linux'>>([]);
  const [countriesRaw, setCountriesRaw] = useState('BR');
  const [weight, setWeight] = useState(50);

  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildRuleConfig = (): RuleConfig => {
    if (ruleType === 'manual') return null;
    if (ruleType === 'device') return { devices };
    if (ruleType === 'os') return { os: osList };
    if (ruleType === 'geo') {
      const countries = countriesRaw
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c.length === 2);
      return { countries };
    }
    if (ruleType === 'weight') return { weight };
    return null;
  };

  const handleAddTarget = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await apiRequest(`/api/links/${linkId}/targets`, {
        method: 'POST',
        body: JSON.stringify({
          label,
          targetUrl,
          ruleType,
          ruleConfig: buildRuleConfig(),
          priority,
          setAsActive: ruleType === 'manual' ? setAsActive : false,
        }),
      });
      setLabel('');
      setTargetUrl('');
      setRuleType('manual');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar destino.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (targetId: number) => {
    setError(null);
    setBusyId(targetId);
    try {
      await apiRequest(`/api/links/${linkId}/active-target`, {
        method: 'PATCH',
        body: JSON.stringify({ targetId }),
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao trocar destino.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (targetId: number) => {
    setError(null);
    setBusyId(targetId);
    try {
      await apiRequest(`/api/links/${linkId}/targets/${targetId}`, { method: 'DELETE' });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover destino.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleItem = <T,>(list: T[], item: T, setter: (v: T[]) => void) => {
    setter(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);
  };

  return (
    <FeatureGate
      feature="url.dynamic_switch"
      fallback={<LockedFeatureNotice feature="url.dynamic_switch" title="URL Dinâmica bloqueada" />}
    >
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {mode !== 'dynamic' && (
          <div className="alert-info">
            Este link está no modo <strong>Estático</strong>. Ao adicionar ou ativar um destino abaixo, ele passará automaticamente para o modo <strong>Dinâmico</strong>.
          </div>
        )}

        {error && (
          <div className="alert-error" role="alert">
            {error}
          </div>
        )}

        <section aria-labelledby="targets-list-heading">
          <h2 id="targets-list-heading" style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 900, textTransform: 'uppercase' }}>
            Destinos Cadastrados ({targets.length})
          </h2>

          {targets.length === 0 ? (
            <div className="neo-card-sm">Nenhum destino dinâmico cadastrado ainda. Adicione o primeiro abaixo.</div>
          ) : (
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              {targets.map((target) => {
                const isSelected = activeTargetId === target.id;
                return (
                  <div
                    key={target.id}
                    className={`neo-card-sm ${isSelected ? 'neo-card-mint' : ''}`}
                    style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.85rem' }}
                  >
                    <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <strong style={{ fontSize: '1rem' }}>{target.label}</strong>
                        <span className="tag tag-muted">{target.ruleType}</span>
                        {isSelected && (
                          <span className="tag tag-purple">
                            <CheckCircle2 size={13} aria-hidden="true" />
                            <span>Ativo agora</span>
                          </span>
                        )}
                        <span className="tag">{target.clicksCount} cliques</span>
                      </div>
                      <div style={{ fontSize: '0.88rem', wordBreak: 'break-all' }}>{target.targetUrl}</div>
                      {target.ruleConfig && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                          Regra: {JSON.stringify(target.ruleConfig)} (prioridade {target.priority})
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {target.ruleType === 'manual' && !isSelected && (
                        <button
                          type="button"
                          className="neo-btn neo-btn-sm neo-btn-yellow"
                          disabled={busyId === target.id}
                          onClick={() => handleActivate(target.id)}
                        >
                          <Shuffle size={15} aria-hidden="true" />
                          <span>Ativar destino</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="neo-btn neo-btn-sm neo-btn-danger"
                        disabled={busyId === target.id}
                        aria-label={`Remover destino ${target.label}`}
                        onClick={() => handleDelete(target.id)}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="neo-card-sm" aria-labelledby="add-target-heading">
          <h2 id="add-target-heading" style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 900, textTransform: 'uppercase' }}>
            Adicionar Novo Destino
          </h2>

          <form className="form-stack" onSubmit={handleAddTarget}>
            <div className="split-grid">
              <div className="field">
                <label htmlFor="target-label" className="field-label">
                  Nome do destino
                </label>
                <input
                  id="target-label"
                  name="label"
                  type="text"
                  className="neo-input"
                  placeholder="Ex: Loja iOS / Campanha B"
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="target-url" className="field-label">
                  URL de destino
                </label>
                <input
                  id="target-url"
                  name="targetUrl"
                  type="url"
                  className="neo-input"
                  placeholder="https://destino.com/oferta"
                  required
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                />
              </div>
            </div>

            <div className="split-grid">
              <div className="field">
                <label htmlFor="target-rule-type" className="field-label">
                  Modo de ativação
                </label>
                <select
                  id="target-rule-type"
                  name="ruleType"
                  className="neo-select"
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value as RuleType)}
                >
                  <option value="manual">Manual (escolha direta do criador)</option>
                  {canConditional && <option value="device">Condicional: Dispositivo</option>}
                  {canConditional && <option value="os">Condicional: Sistema Operacional</option>}
                  {canConditional && <option value="geo">Condicional: País (Geo)</option>}
                  {canConditional && <option value="weight">Teste A/B (Peso percentual)</option>}
                </select>
              </div>

              {ruleType !== 'manual' && (
                <div className="field">
                  <label htmlFor="target-priority" className="field-label">
                    Prioridade (menor = primeiro)
                  </label>
                  <input
                    id="target-priority"
                    name="priority"
                    type="number"
                    min={0}
                    max={999}
                    className="neo-input"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                  />
                </div>
              )}
            </div>

            {!canConditional && (
              <LockedFeatureNotice
                feature="url.conditional_rules"
                title="Regras automáticas (Device, OS, Geo, A/B)"
                description="No seu plano atual você pode alternar manualmente entre destinos. Regras automáticas requerem liberação de 'url.conditional_rules'."
              />
            )}

            {ruleType === 'manual' && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={setAsActive}
                  onChange={(e) => setSetAsActive(e.target.checked)}
                />
                <span>Definir imediatamente como destino ativo deste Short URL</span>
              </label>
            )}

            {ruleType === 'device' && (
              <fieldset style={{ border: '2px solid var(--ink)', padding: '0.75rem' }}>
                <legend className="field-label">Dispositivos</legend>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                  {(['mobile', 'tablet', 'desktop'] as const).map((d) => (
                    <label key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <input type="checkbox" checked={devices.includes(d)} onChange={() => toggleItem(devices, d, setDevices)} />
                      <span>{d}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {ruleType === 'os' && (
              <fieldset style={{ border: '2px solid var(--ink)', padding: '0.75rem' }}>
                <legend className="field-label">Sistemas Operacionais</legend>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                  {(['iOS', 'Android', 'Windows', 'macOS', 'Linux'] as const).map((os) => (
                    <label key={os} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <input type="checkbox" checked={osList.includes(os)} onChange={() => toggleItem(osList, os, setOsList)} />
                      <span>{os}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {ruleType === 'geo' && (
              <div className="field">
                <label htmlFor="geo-countries" className="field-label">
                  Códigos ISO de País (ex: BR, US, PT)
                </label>
                <input
                  id="geo-countries"
                  type="text"
                  className="neo-input"
                  value={countriesRaw}
                  onChange={(e) => setCountriesRaw(e.target.value)}
                />
              </div>
            )}

            {ruleType === 'weight' && (
              <div className="field">
                <label htmlFor="ab-weight" className="field-label">
                  Peso relativo (1–100)
                </label>
                <input
                  id="ab-weight"
                  type="number"
                  min={1}
                  max={100}
                  className="neo-input"
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                />
              </div>
            )}

            <button type="submit" className="neo-btn neo-btn-primary" disabled={submitting}>
              <Plus size={18} aria-hidden="true" />
              <span>{submitting ? 'Salvando...' : 'Adicionar destino'}</span>
            </button>
          </form>
        </section>
      </div>
    </FeatureGate>
  );
}
