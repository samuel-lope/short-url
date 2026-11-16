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
      <section className="y2k-window" aria-labelledby="home-title">
        <div className="y2k-titlebar">
          <span>SHORT_API.EXE — {user ? user.plan.name.toUpperCase() : 'ANÔNIMO'}</span>
          <span className="y2k-titlebar-dots" aria-hidden="true">
            <span className="y2k-win-glyph">_</span>
            <span className="y2k-win-glyph">□</span>
            <span className="y2k-win-glyph">×</span>
          </span>
        </div>

        <div className="y2k-window-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <h1 id="home-title" className="page-title" style={{ margin: 0, flex: 1 }}>
              Encurtador Y2K
            </h1>
            <span className="y2k-badge-pill">{user ? user.plan.name : 'Anônimo'}</span>
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
              <div className="field">
                <label htmlFor="long-url" className="field-label">
                  URL Longa
                </label>
                <span id="url-hint" className="field-hint">
                  Inclua http:// ou https://
                </span>
                <input
                  id="long-url"
                  name="url"
                  type="url"
                  className="y2k-input"
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
                  Apelido (Opcional)
                </label>
                <input
                  id="title-url"
                  name="title"
                  type="text"
                  className="y2k-input"
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
                    <fieldset style={{ border: '2px solid var(--bevel-mid)', borderRadius: 6, padding: '0.75rem', margin: 0 }}>
                      <legend className="field-label">Tipo de Link</legend>
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
                        Slug Personalizado (Opcional)
                      </label>
                      <span id="slug-hint" className="field-hint">
                        3 a 40 caracteres: letras, números, - ou _
                      </span>
                      <input
                        id="custom-slug"
                        name="customSlug"
                        type="text"
                        className="y2k-input"
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

              <button type="submit" className="y2k-btn y2k-btn-primary" disabled={submitting}>
                {submitting ? 'Encurtando...' : 'Criar Link Curto'}
              </button>
            </form>
          </FeatureGate>

          {error && (
            <div className="alert-error" role="alert" style={{ marginTop: '1.25rem' }}>
              ERRO: {error}
            </div>
          )}

          {result && (
            <div className="y2k-card-sm y2k-card-mint" style={{ marginTop: '1.5rem' }} aria-live="polite">
              <span className="field-label" style={{ marginBottom: '0.5rem' }}>
                Seu link pronto:
              </span>
              <div
                className="mono-url"
                style={{
                  background: '#ffffff',
                  border: '2px solid var(--bevel-dark)',
                  borderRadius: 4,
                  padding: '0.75rem',
                  fontWeight: 800,
                  marginBottom: '0.85rem',
                }}
              >
                {result.short_url}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                <CopyButton text={result.short_url} label="Copiar Link" />
                {user && result.id && (
                  <Link to={`/app/links/${result.id}`} className="y2k-btn y2k-btn-sm y2k-btn-yellow">
                    <span>Gerenciar QR / Dinâmico / Uso</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {!user && (
        <section className="y2k-card-sm" style={{ marginTop: '1.25rem' }} aria-label="Recursos avançados com conta">
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.02rem', fontWeight: 800 }}>
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
            <Link to="/register" className="y2k-btn y2k-btn-sm y2k-btn-mint">
              Criar conta grátis
            </Link>
            <Link to="/login" className="y2k-btn y2k-btn-sm">
              Já tenho conta
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
