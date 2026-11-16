import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, ChevronDown, QrCode, Shuffle, Sparkles } from 'lucide-react';
import { useAuth } from '../../app/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import { CopyButton } from '../../shared/CopyButton.tsx';
import { FeatureGate, LockedFeatureNotice } from '../../shared/FeatureGate.tsx';
import {
  Alert,
  Badge,
  BentoGrid,
  Button,
  ButtonLink,
  ChoiceGroup,
  Field,
  TextInput,
  Tile,
} from '../../shared/ui/index.ts';

interface ShortenResponse {
  id: number;
  short_code: string;
  short_url: string;
  original_url: string;
  mode?: 'static' | 'dynamic';
}

export function PublicHomePage() {
  const { user, features, hasFeature } = useAuth();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [mode, setMode] = useState<'static' | 'dynamic'>('static');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShortenResponse | null>(null);

  const enabledCount = Object.values(features).filter((f) => f.enabled).length;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);

    try {
      if (user) {
        const data = await apiRequest<ShortenResponse>('/api/links', {
          method: 'POST',
          body: JSON.stringify({
            url,
            title: title || undefined,
            customSlug: customSlug || undefined,
            mode,
          }),
        });
        setResult(data);
      } else {
        const data = await apiRequest<ShortenResponse>('/api/public/shorten', {
          method: 'POST',
          body: JSON.stringify({
            url,
            title: title || undefined,
          }),
        });
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao encurtar URL.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BentoGrid cols={4} label="Encurtador de URLs">
      <Tile c={3} r={2} as="section" aria-labelledby="home-title">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <Badge tone="accent">
            <Sparkles size={13} aria-hidden="true" />
            <span>Short API · sa.api.br / ue.ia.br</span>
          </Badge>
          <Badge tone={user ? 'success' : 'neutral'}>
            {user ? user.plan.name : 'Modo anônimo'}
          </Badge>
        </div>

        <div>
          <h1 id="home-title" className="hero-title">
            Links curtos, dinâmicos e mensuráveis.
          </h1>
          <p className="text-muted" style={{ margin: '0.5rem 0 0', maxWidth: '54ch' }}>
            Encurte uma URL instantaneamente ou entre para gerenciar destinos dinâmicos, QR Codes editáveis e registro de uso.
          </p>
        </div>

        <FeatureGate
          feature="links.create"
          fallback={
            <LockedFeatureNotice
              feature="links.create"
              title="Criação de links desabilitada"
              description="O perfil atual não tem permissão para criar novos links. Faça login ou contate o administrador."
            />
          }
        >
          <form className="form-stack" onSubmit={handleSubmit}>
            <Field label="URL de destino" htmlFor="long-url" hint="Inclua http:// ou https://" required>
              {({ inputId, describedBy }) => (
                <TextInput
                  id={inputId}
                  name="url"
                  type="url"
                  hero
                  placeholder="https://exemplo.com/pagina-muito-longa"
                  required
                  autoComplete="url"
                  spellCheck={false}
                  autoCapitalize="none"
                  enterKeyHint="done"
                  aria-describedby={describedBy}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              )}
            </Field>

            <details className="details-panel">
              <summary className="details-summary">
                <span>Opções avançadas (apelido{user ? ', modo dinâmico, slug' : ''})</span>
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <div className="details-body">
                <Field label="Apelido (opcional)" htmlFor="title-url">
                  {({ inputId }) => (
                    <TextInput
                      id={inputId}
                      name="title"
                      type="text"
                      placeholder="Ex: Campanha Lançamento"
                      maxLength={120}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  )}
                </Field>

                {user && (
                  <>
                    <FeatureGate feature="url.dynamic_switch">
                      <ChoiceGroup
                        legend="Tipo de link"
                        name="mode"
                        type="radio"
                        value={mode}
                        onChange={(v) => setMode(v)}
                        options={[
                          { value: 'static', label: 'Estático' },
                          { value: 'dynamic', label: 'Dinâmico (troca de destino + regras)' },
                        ]}
                      />
                    </FeatureGate>

                    <FeatureGate feature="links.custom_slug">
                      <Field
                        label="Slug personalizado (opcional)"
                        htmlFor="custom-slug"
                        hint="3 a 40 caracteres: letras, números, - ou _"
                      >
                        {({ inputId, describedBy }) => (
                          <TextInput
                            id={inputId}
                            name="customSlug"
                            type="text"
                            placeholder="promo-natal"
                            spellCheck={false}
                            autoCapitalize="none"
                            aria-describedby={describedBy}
                            value={customSlug}
                            onChange={(e) => setCustomSlug(e.target.value)}
                          />
                        )}
                      </Field>
                    </FeatureGate>
                  </>
                )}
              </div>
            </details>

            <div>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'Encurtando...' : 'Criar link curto'}
              </Button>
            </div>
          </form>
        </FeatureGate>

        {error && <Alert tone="error">{error}</Alert>}
      </Tile>

      <Tile
        c={1}
        title={user ? user.name : 'Perfil Anônimo'}
        subtitle={user ? `Perfil ativo: ${user.plan.name}` : 'Encurtamento rápido sem cadastro'}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          <Badge tone="accent">{enabledCount} recursos ativos</Badge>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {user ? (
            hasFeature('links.manage_own') && (
              <ButtonLink to="/app" variant="secondary" size="sm">
                <span>Abrir Painel</span>
                <ArrowRight size={15} aria-hidden="true" />
              </ButtonLink>
            )
          ) : (
            <>
              <ButtonLink to="/register" variant="primary" size="sm">
                Criar conta grátis
              </ButtonLink>
              <ButtonLink to="/login" variant="ghost" size="sm">
                Já tenho conta
              </ButtonLink>
            </>
          )}
        </div>
      </Tile>

      <Tile c={1} variant="muted" title="Sem expiração" subtitle="Compatível com links legados Hashids e redirecionamento 302 com tracking.">
        <div style={{ marginTop: 'auto' }}>
          <Badge>Edge D1</Badge>
        </div>
      </Tile>

      {result && (
        <Tile c={4} title="Link curto pronto" aria-live="polite">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.85rem',
            }}
          >
            <a href={result.short_url} target="_blank" rel="noreferrer" className="mono-url" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {result.short_url}
            </a>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <CopyButton text={result.short_url} label="Copiar link" />
              {user && result.id && (
                <ButtonLink to={`/app/links/${result.id}`} variant="primary" size="sm">
                  <span>Gerenciar QR / Dinâmico / Uso</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </ButtonLink>
              )}
            </div>
          </div>
        </Tile>
      )}

      {!user && (
        <>
          <Tile c={1} title="URL Dinâmica" subtitle="Troque o destino do mesmo short link a qualquer momento ou aplique regras.">
            <div style={{ marginTop: 'auto', color: 'var(--accent)' }}>
              <Shuffle size={22} aria-hidden="true" />
            </div>
          </Tile>

          <Tile c={1} title="QR Dinâmico" subtitle="Personalize cores e exporte PNG ou SVG sem alterar o código impresso.">
            <div style={{ marginTop: 'auto', color: 'var(--accent)' }}>
              <QrCode size={22} aria-hidden="true" />
            </div>
          </Tile>

          <Tile
            c={2}
            variant="accent"
            title="Registro de Uso em tempo real"
            subtitle="Acompanhe cliques, scans de QR, visitantes únicos, países, dispositivos e origens."
            action={<BarChart3 size={22} aria-hidden="true" />}
          >
            <div style={{ marginTop: 'auto', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <Link to="/register" className="btn btn--sm btn--on-accent">
                <span>Começar agora</span>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </Tile>
        </>
      )}
    </BentoGrid>
  );
}
