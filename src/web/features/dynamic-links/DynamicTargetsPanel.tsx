import { useState, type FormEvent } from 'react';
import { CheckCircle2, Plus, Shuffle, Trash2 } from 'lucide-react';
import type { RuleConfig, RuleType } from '../../../shared/contracts.ts';
import { useAuth } from '../../app/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import { FeatureGate, LockedFeatureNotice } from '../../shared/FeatureGate.tsx';
import { Modal } from '../../shared/Modal.tsx';
import {
  Alert,
  Badge,
  BentoGrid,
  Button,
  ChoiceGroup,
  EmptyState,
  Field,
  SelectInput,
  TextInput,
  Tile,
} from '../../shared/ui/index.ts';

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

function formatRuleSummary(ruleType: RuleType, ruleConfig: RuleConfig): string[] {
  if (ruleType === 'manual' || !ruleConfig) return [];
  const chips: string[] = [];
  if (ruleConfig.devices?.length) chips.push(`Dispositivos: ${ruleConfig.devices.join(', ')}`);
  if (ruleConfig.os?.length) chips.push(`OS: ${ruleConfig.os.join(', ')}`);
  if (ruleConfig.countries?.length) chips.push(`Países: ${ruleConfig.countries.join(', ')}`);
  if (ruleConfig.weight !== undefined) chips.push(`Peso A/B: ${ruleConfig.weight}%`);
  return chips;
}

export function DynamicTargetsPanel({ linkId, mode, activeTargetId, targets, onRefresh }: Props) {
  const { hasFeature } = useAuth();
  const canConditional = hasFeature('url.conditional_rules');

  const [label, setLabel] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [ruleType, setRuleType] = useState<RuleType>('manual');
  const [priority, setPriority] = useState(0);
  const [setAsActive, setSetAsActive] = useState(true);

  const [devices, setDevices] = useState<Array<'mobile' | 'tablet' | 'desktop'>>([]);
  const [osList, setOsList] = useState<Array<'iOS' | 'Android' | 'Windows' | 'macOS' | 'Linux'>>([]);
  const [countriesRaw, setCountriesRaw] = useState('BR');
  const [weight, setWeight] = useState(50);

  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LinkTargetItem | null>(null);
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

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setError(null);
    setBusyId(deleteTarget.id);
    try {
      await apiRequest(`/api/links/${linkId}/targets/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
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
      <div style={{ display: 'grid', gap: '1.25rem' }}>
        {mode !== 'dynamic' && (
          <Alert tone="info">
            Este link está no modo <strong>Estático</strong>. Ao adicionar ou ativar um destino abaixo, ele passará automaticamente para o modo <strong>Dinâmico</strong>.
          </Alert>
        )}

        {error && <Alert tone="error">{error}</Alert>}

        <BentoGrid cols={4} label="Destinos dinâmicos">
          {targets.length === 0 ? (
            <Tile c={4} variant="muted">
              <EmptyState
                icon={<Shuffle size={26} aria-hidden="true" />}
                title="Nenhum destino dinâmico cadastrado"
                description="Adicione destinos abaixo para alternar para onde este Short URL aponta."
              />
            </Tile>
          ) : (
            targets.map((target) => {
              const isSelected = activeTargetId === target.id;
              const chips = formatRuleSummary(target.ruleType, target.ruleConfig);
              return (
                <Tile
                  key={target.id}
                  c={2}
                  variant={isSelected ? 'accent' : 'default'}
                  title={target.label}
                  action={
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <Badge tone={isSelected ? 'neutral' : 'accent'}>{target.ruleType}</Badge>
                      <Badge>{target.clicksCount} cliques</Badge>
                    </div>
                  }
                >
                  <div className="mono-url" style={{ fontSize: '0.86rem' }}>
                    {target.targetUrl}
                  </div>

                  {chips.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {chips.map((chip) => (
                        <Badge key={chip} tone="neutral">
                          {chip}
                        </Badge>
                      ))}
                      <Badge tone="neutral">Prioridade {target.priority}</Badge>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 'auto' }}>
                    {isSelected ? (
                      <Badge tone="success">
                        <CheckCircle2 size={13} aria-hidden="true" />
                        <span>Ativo agora</span>
                      </Badge>
                    ) : (
                      target.ruleType === 'manual' && (
                        <Button
                          size="sm"
                          disabled={busyId === target.id}
                          onClick={() => handleActivate(target.id)}
                        >
                          <Shuffle size={14} aria-hidden="true" />
                          <span>Ativar destino</span>
                        </Button>
                      )
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busyId === target.id}
                      aria-label={`Remover destino ${target.label}`}
                      onClick={() => setDeleteTarget(target)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </Button>
                  </div>
                </Tile>
              );
            })
          )}

          <Tile c={4} variant="muted" title="Adicionar novo destino" as="section" aria-labelledby="add-target-heading">
            <form className="form-stack" onSubmit={handleAddTarget}>
              <div className="form-row">
                <Field label="Nome do destino" htmlFor="target-label" required>
                  {({ inputId }) => (
                    <TextInput
                      id={inputId}
                      name="label"
                      type="text"
                      placeholder="Ex: Loja iOS / Campanha B"
                      required
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                    />
                  )}
                </Field>

                <Field label="URL de destino" htmlFor="target-url" required>
                  {({ inputId }) => (
                    <TextInput
                      id={inputId}
                      name="targetUrl"
                      type="url"
                      placeholder="https://destino.com/oferta"
                      required
                      value={targetUrl}
                      onChange={(e) => setTargetUrl(e.target.value)}
                    />
                  )}
                </Field>
              </div>

              <div className="form-row">
                <Field label="Modo de ativação" htmlFor="target-rule-type">
                  {({ inputId }) => (
                    <SelectInput
                      id={inputId}
                      name="ruleType"
                      value={ruleType}
                      onChange={(e) => setRuleType(e.target.value as RuleType)}
                    >
                      <option value="manual">Manual (escolha direta do criador)</option>
                      {canConditional && <option value="device">Condicional: Dispositivo</option>}
                      {canConditional && <option value="os">Condicional: Sistema Operacional</option>}
                      {canConditional && <option value="geo">Condicional: País (Geo)</option>}
                      {canConditional && <option value="weight">Teste A/B (Peso percentual)</option>}
                    </SelectInput>
                  )}
                </Field>

                {ruleType !== 'manual' && (
                  <Field label="Prioridade (menor = primeiro)" htmlFor="target-priority">
                    {({ inputId }) => (
                      <TextInput
                        id={inputId}
                        name="priority"
                        type="number"
                        min={0}
                        max={999}
                        value={priority}
                        onChange={(e) => setPriority(Number(e.target.value))}
                      />
                    )}
                  </Field>
                )}
              </div>

              {!canConditional && (
                <LockedFeatureNotice
                  feature="url.conditional_rules"
                  title="Regras automáticas (Device, OS, Geo, A/B)"
                  description="No seu perfil atual você pode alternar manualmente entre destinos. Regras automáticas requerem liberação de 'url.conditional_rules'."
                />
              )}

              {ruleType === 'manual' && (
                <label className="choice-pill" style={{ width: 'fit-content' }}>
                  <input
                    type="checkbox"
                    checked={setAsActive}
                    onChange={(e) => setSetAsActive(e.target.checked)}
                  />
                  <span>Definir imediatamente como destino ativo</span>
                </label>
              )}

              {ruleType === 'device' && (
                <ChoiceGroup
                  legend="Dispositivos"
                  name="devices"
                  type="checkbox"
                  value={devices}
                  onChange={(d) => toggleItem(devices, d, setDevices)}
                  options={[
                    { value: 'mobile', label: 'Mobile' },
                    { value: 'tablet', label: 'Tablet' },
                    { value: 'desktop', label: 'Desktop' },
                  ]}
                />
              )}

              {ruleType === 'os' && (
                <ChoiceGroup
                  legend="Sistemas Operacionais"
                  name="os"
                  type="checkbox"
                  value={osList}
                  onChange={(os) => toggleItem(osList, os, setOsList)}
                  options={[
                    { value: 'iOS', label: 'iOS' },
                    { value: 'Android', label: 'Android' },
                    { value: 'Windows', label: 'Windows' },
                    { value: 'macOS', label: 'macOS' },
                    { value: 'Linux', label: 'Linux' },
                  ]}
                />
              )}

              {ruleType === 'geo' && (
                <Field label="Códigos ISO de País (ex: BR, US, PT)" htmlFor="geo-countries">
                  {({ inputId }) => (
                    <TextInput
                      id={inputId}
                      type="text"
                      value={countriesRaw}
                      onChange={(e) => setCountriesRaw(e.target.value)}
                    />
                  )}
                </Field>
              )}

              {ruleType === 'weight' && (
                <Field label="Peso relativo (1–100)" htmlFor="ab-weight">
                  {({ inputId }) => (
                    <TextInput
                      id={inputId}
                      type="number"
                      min={1}
                      max={100}
                      value={weight}
                      onChange={(e) => setWeight(Number(e.target.value))}
                    />
                  )}
                </Field>
              )}

              <div>
                <Button type="submit" variant="primary" disabled={submitting}>
                  <Plus size={17} aria-hidden="true" />
                  <span>{submitting ? 'Salvando...' : 'Adicionar destino'}</span>
                </Button>
              </div>
            </form>
          </Tile>
        </BentoGrid>
      </div>

      <Modal
        open={Boolean(deleteTarget)}
        title="Remover destino?"
        onClose={() => setDeleteTarget(null)}
      >
        <p style={{ marginTop: 0 }}>
          Remover o destino <strong>{deleteTarget?.label}</strong> (<span className="mono-url">{deleteTarget?.targetUrl}</span>)?
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
          <Button size="sm" autoFocus onClick={() => setDeleteTarget(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={busyId === deleteTarget?.id}
            onClick={handleConfirmDelete}
          >
            Confirmar remoção
          </Button>
        </div>
      </Modal>
    </FeatureGate>
  );
}
