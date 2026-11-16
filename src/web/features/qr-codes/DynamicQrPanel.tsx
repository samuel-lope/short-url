import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { Download, Save } from 'lucide-react';
import type { QrStyle } from '../../../shared/contracts.ts';
import { apiRequest } from '../../lib/api.ts';
import { FeatureGate, LockedFeatureNotice } from '../../shared/FeatureGate.tsx';
import { CopyButton } from '../../shared/CopyButton.tsx';

interface Props {
  linkId: number;
  qrUrl: string;
  shortCode: string;
  initialQr: {
    id: number;
    scanCount: number;
    style: Partial<QrStyle>;
  } | null;
  onSaved: () => Promise<void>;
}

const DEFAULT_STYLE: QrStyle = {
  fgColor: '#000000',
  bgColor: '#ffffff',
  errorCorrectionLevel: 'M',
  margin: 2,
  frameLabel: '',
};

export function DynamicQrPanel({ linkId, qrUrl, shortCode, initialQr, onSaved }: Props) {
  const [style, setStyle] = useState<QrStyle>({ ...DEFAULT_STYLE, ...(initialQr?.style ?? {}) });
  const [previewPng, setPreviewPng] = useState<string>('');
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function renderQr() {
      try {
        const [pngUrl, svg] = await Promise.all([
          QRCode.toDataURL(qrUrl, {
            width: 320,
            margin: style.margin,
            errorCorrectionLevel: style.errorCorrectionLevel,
            color: { dark: style.fgColor, light: style.bgColor },
          }),
          QRCode.toString(qrUrl, {
            type: 'svg',
            margin: style.margin,
            errorCorrectionLevel: style.errorCorrectionLevel,
            color: { dark: style.fgColor, light: style.bgColor },
          }),
        ]);
        if (!cancelled) {
          setPreviewPng(pngUrl);
          setSvgMarkup(svg);
        }
      } catch (err) {
        console.error('QR generation failed:', err);
      }
    }
    void renderQr();
    return () => {
      cancelled = true;
    };
  }, [qrUrl, style]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await apiRequest(`/api/qr/${linkId}`, {
        method: 'PUT',
        body: JSON.stringify({ style }),
      });
      setSavedMsg('QR Code dinâmico salvo!');
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar QR Code.');
    } finally {
      setSaving(false);
    }
  };

  const downloadPng = () => {
    if (!previewPng) return;
    const a = document.createElement('a');
    a.href = previewPng;
    a.download = `qr-${shortCode}.png`;
    a.click();
  };

  const downloadSvg = () => {
    if (!svgMarkup) return;
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${shortCode}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <FeatureGate
      feature="qr.dynamic"
      fallback={<LockedFeatureNotice feature="qr.dynamic" title="QR Code Dinâmico bloqueado" />}
    >
      <div className="split-grid">
        <div className="neo-card-sm" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <span className="tag tag-mint">QR Dinâmico</span>
            <span className="tag">{initialQr?.scanCount ?? 0} scans</span>
          </div>

          <div
            style={{
              border: '4px solid #000',
              padding: '0.75rem',
              background: style.bgColor,
              textAlign: 'center',
            }}
          >
            {previewPng && (
              <img
                src={previewPng}
                alt={`QR Code dinâmico para ${qrUrl}`}
                width={240}
                height={240}
                style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
              />
            )}
            {style.frameLabel && (
              <div style={{ fontWeight: 900, marginTop: '0.5rem', color: style.fgColor, textTransform: 'uppercase' }}>
                {style.frameLabel}
              </div>
            )}
          </div>

          <div style={{ fontSize: '0.82rem', wordBreak: 'break-all', textAlign: 'center' }}>
            Codifica: <strong>{qrUrl}</strong>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <CopyButton text={qrUrl} label="Copiar URL QR" />
            <button type="button" className="neo-btn neo-btn-sm neo-btn-yellow" onClick={downloadPng}>
              <Download size={15} aria-hidden="true" />
              <span>PNG</span>
            </button>
            <button type="button" className="neo-btn neo-btn-sm" onClick={downloadSvg}>
              <Download size={15} aria-hidden="true" />
              <span>SVG</span>
            </button>
          </div>
        </div>

        <form className="neo-card-sm form-stack" onSubmit={handleSave}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, textTransform: 'uppercase' }}>
            Personalizar QR Dinâmico
          </h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
            Alterar o destino ou as regras do link curto atualiza este QR automaticamente sem precisar reimprimir.
          </p>

          <div className="split-grid">
            <div className="field">
              <label htmlFor="qr-fg" className="field-label">
                Cor dos módulos
              </label>
              <input
                id="qr-fg"
                type="color"
                className="neo-input"
                style={{ padding: '0.25rem' }}
                value={style.fgColor}
                onChange={(e) => setStyle({ ...style, fgColor: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="qr-bg" className="field-label">
                Cor de fundo
              </label>
              <input
                id="qr-bg"
                type="color"
                className="neo-input"
                style={{ padding: '0.25rem' }}
                value={style.bgColor}
                onChange={(e) => setStyle({ ...style, bgColor: e.target.value })}
              />
            </div>
          </div>

          <div className="split-grid">
            <div className="field">
              <label htmlFor="qr-ecc" className="field-label">
                Correção de erro
              </label>
              <select
                id="qr-ecc"
                className="neo-select"
                value={style.errorCorrectionLevel}
                onChange={(e) =>
                  setStyle({ ...style, errorCorrectionLevel: e.target.value as QrStyle['errorCorrectionLevel'] })
                }
              >
                <option value="L">Baixa (L - 7%)</option>
                <option value="M">Média (M - 15%)</option>
                <option value="Q">Alta (Q - 25%)</option>
                <option value="H">Máxima (H - 30%)</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="qr-margin" className="field-label">
                Margem (0–10)
              </label>
              <input
                id="qr-margin"
                type="number"
                min={0}
                max={10}
                className="neo-input"
                value={style.margin}
                onChange={(e) => setStyle({ ...style, margin: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="qr-frame" className="field-label">
              Legenda da moldura (Opcional)
            </label>
            <input
              id="qr-frame"
              type="text"
              maxLength={32}
              className="neo-input"
              placeholder="Ex: ESCANEIE AQUI"
              value={style.frameLabel ?? ''}
              onChange={(e) => setStyle({ ...style, frameLabel: e.target.value })}
            />
          </div>

          {error && (
            <div className="alert-error" role="alert">
              {error}
            </div>
          )}
          {savedMsg && (
            <div className="neo-card-sm neo-card-mint" role="status">
              <strong>{savedMsg}</strong>
            </div>
          )}

          <button type="submit" className="neo-btn neo-btn-primary" disabled={saving}>
            <Save size={17} aria-hidden="true" />
            <span>{saving ? 'Salvando...' : initialQr ? 'Atualizar QR Dinâmico' : 'Criar QR Dinâmico'}</span>
          </button>
        </form>
      </div>
    </FeatureGate>
  );
}
