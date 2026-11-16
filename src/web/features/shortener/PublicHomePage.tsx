import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, QrCode, Shuffle } from 'lucide-react';
import { useAuth } from '../../app/AuthContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import { CopyButton } from '../../shared/CopyButton.tsx';
import { FeatureGate, LockedFeatureNotice } from '../../shared/FeatureGate.tsx';

interface ShortenResponse {
  id: number;
  short_code: string;
  short_url: string;
  original_url: string;
  mode?: 'static' | 'dynamic';
}

export function PublicHomePage() {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [mode, setMode] = useState<'static' | 'dynamic'>('static');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShortenResponse | null>(null);

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
    <div className="main-narrow">
      <section className="neo-card" aria-labelledby="home-title">
        <div className="floating-badge">{user ? user.plan.name.toUpperCase() : 'ANÔNIMO'}</div>
        <h1 id="home-title" className="page-title">
          SHORT
          <br />
          API
        </h1>

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
          <div className="field">
            <label htmlFor="long-url" className="field-label">
              URL LONGA
            </label>
            <span id="url-hint" className="field-hint">
              Inclua http:// ou https://
            </span>
            <input
              id="long-url"
              name="url"
              type="url"
              className="neo-input"
              placeholder="https://exemplo.com/muito-longo"
              required
              autoComplete="url"
              spellCheck={false}
              autoCapitalize="none"
              enterKeyHint="next"
              aria-describedby="url-hint"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="title-url" className="field-label">
              APELIDO (Opcional)
            </label>
            <input
              id="title-url"
              name="title"
              type="text"
              className="neo-input"
              placeholder="Ex: Campanha Lançamento"
              maxLength={120}
              enterKeyHint="done"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {user && (
            <>
              <FeatureGate feature="url.dynamic_switch">
                <fieldset style={{ border: '2px solid var(--ink)', padding: '0.75rem', margin: 0 }}>
                  <legend className="field-label">TIPO DE LINK</legend>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="mode"
                        value="static"
                        checked={mode === 'static'}
                        onChange={() => setMode('static')}
                      />
                      <span>Estático</span>
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="mode"
                        value="dynamic"
                        checked={mode === 'dynamic'}
                        onChange={() => setMode('dynamic')}
                      />
                      <span>Dinâmico (troca de destino + regras)</span>
                    </label>
                  </div>
                </fieldset>
              </FeatureGate>

              <FeatureGate feature="links.custom_slug">
                <div className="field">
                  <label htmlFor="custom-slug" className="field-label">
                    SLUG PERSONALIZADO (Opcional)
                  </label>
                  <span id="slug-hint" className="field-hint">
                    3 a 40 caracteres: letras, números, - ou _
                  </span>
                  <input
                    id="custom-slug"
                    name="customSlug"
                    type="text"
                    className="neo-input"
                    placeholder="promo-natal"
                    spellCheck={false}
                    autoCapitalize="none"
                    aria-describedby="slug-hint"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value)}
                  />
                </div>
              </FeatureGate>
            </>
          )}

          <button type="submit" className="neo-btn neo-btn-primary" disabled={submitting}>
            {submitting ? 'ENCURTANDO...' : 'CRIAR LINK CURTO'}
          </button>
        </form>
        </FeatureGate>

        {error && (
          <div className="alert-error" role="alert" style={{ marginTop: '1.25rem' }}>
            ERRO: {error}
          </div>
        )}

        {result && (
          <div className="neo-card-sm neo-card-mint" style={{ marginTop: '1.5rem' }} aria-live="polite">
            <span className="field-label" style={{ background: '#fff', marginBottom: '0.5rem' }}>
              SEU LINK PRONTO:
            </span>
            <div
              style={{
                background: '#fff',
                border: '2px solid #000',
                padding: '0.75rem',
                fontWeight: 800,
                wordBreak: 'break-all',
                marginBottom: '0.85rem',
              }}
            >
              {result.short_url}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
              <CopyButton text={result.short_url} label="Copiar Link" />
              {user && result.id && (
                <Link to={`/app/links/${result.id}`} className="neo-btn neo-btn-sm neo-btn-yellow">
                  <span>Gerenciar QR / Dinâmico / Uso</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
        )}
      </section>

      {!user && (
        <section className="neo-card-sm" style={{ marginTop: '1.5rem' }} aria-label="Recursos avançados com conta">
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem', fontWeight: 900, textTransform: 'uppercase' }}>
            Desbloqueie recursos avançados com sua conta
          </h2>
          <ul style={{ margin: '0 0 1rem', paddingLeft: '1.25rem', display: 'grid', gap: '0.4rem', fontSize: '0.92rem' }}>
            <li>
              <Shuffle size={15} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }} />
              <strong>URL Dinâmica:</strong> troque o destino do mesmo short link a qualquer momento ou use regras.
            </li>
            <li>
              <QrCode size={15} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }} />
              <strong>QR Code Dinâmico:</strong> personalize cores e exporte SVG/PNG sem mudar o código impresso.
            </li>
            <li>
              <BarChart3 size={15} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }} />
              <strong>Registro de Uso:</strong> acompanhe cliques, scans de QR, dispositivos e origem.
            </li>
          </ul>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <Link to="/register" className="neo-btn neo-btn-sm neo-btn-mint">
              Criar conta grátis
            </Link>
            <Link to="/login" className="neo-btn neo-btn-sm">
              Já tenho conta
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
