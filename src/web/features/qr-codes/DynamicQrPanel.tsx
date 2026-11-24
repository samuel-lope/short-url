import { useEffect, useState, type FormEvent } from 'react';
import { Download, Save } from 'lucide-react';
import type { LinkQrInfo, QrStyle } from '../../../shared/contracts.ts';
import { apiRequest } from '../../lib/api.ts';
import { FeatureGate, LockedFeatureNotice } from '../../shared/FeatureGate.tsx';
import { CopyButton } from '../../shared/CopyButton.tsx';
import {
  Alert,
  Badge,
  BentoGrid,
  Button,
  Field,
  SelectInput,
  TextInput,
  Tile,
} from '../../shared/ui/index.ts';

interface Props {
  linkId: number;
  qrUrl: string;
  shortCode: string;
  initialQr: LinkQrInfo | null;
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
        const QRCode = (await import('qrcode')).default;
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
      <BentoGrid cols={4} label="QR Code dinâmico">
        <Tile
          c={2}
          title="Pré-visualização"
          action={
            <div className="cluster-xs">
              <Badge tone="success">QR Dinâmico</Badge>
              <Badge>{initialQr?.scanCount ?? 0} scans</Badge>
            </div>
          }
        >
          <div className="qr-preview-wrap">
            <div className="qr-frame" style={{ background: style.bgColor }}>
              {previewPng && (
                <img
                  src={previewPng}
                  alt={`QR Code dinâmico para ${qrUrl}`}
                  width={220}
                  height={220}
                  className="qr-img"
                />
              )}
              {style.frameLabel && (
                <div className="qr-frame-label" style={{ color: style.fgColor }}>
                  {style.frameLabel}
                </div>
              )}
            </div>

            <div className="mono-url text-muted meta-text">
              Codifica: <strong>{qrUrl}</strong>
            </div>

            <div className="cluster cluster-center">
              <CopyButton text={qrUrl} label="Copiar URL QR" />
              <Button size="sm" onClick={downloadPng}>
                <Download size={15} aria-hidden="true" />
                <span>PNG</span>
              </Button>
              <Button size="sm" onClick={downloadSvg}>
                <Download size={15} aria-hidden="true" />
                <span>SVG</span>
              </Button>
            </div>
          </div>
        </Tile>

        <Tile
          c={2}
          variant="muted"
          title="Personalizar estilo"
          subtitle="Alterar o destino ou as regras do link curto atualiza este QR automaticamente sem precisar reimprimir."
        >
          <form className="form-stack" onSubmit={handleSave}>
            <div className="form-row">
              <Field label="Cor dos módulos" htmlFor="qr-fg">
                {({ inputId }) => (
                  <TextInput
                    id={inputId}
                    type="color"
                    className="input--color"
                    value={style.fgColor}
                    onChange={(e) => setStyle({ ...style, fgColor: e.target.value })}
                  />
                )}
              </Field>

              <Field label="Cor de fundo" htmlFor="qr-bg">
                {({ inputId }) => (
                  <TextInput
                    id={inputId}
                    type="color"
                    className="input--color"
                    value={style.bgColor}
                    onChange={(e) => setStyle({ ...style, bgColor: e.target.value })}
                  />
                )}
              </Field>
            </div>

            <div className="form-row">
              <Field label="Correção de erro" htmlFor="qr-ecc">
                {({ inputId }) => (
                  <SelectInput
                    id={inputId}
                    value={style.errorCorrectionLevel}
                    onChange={(e) =>
                      setStyle({
                        ...style,
                        errorCorrectionLevel: e.target.value as QrStyle['errorCorrectionLevel'],
                      })
                    }
                  >
                    <option value="L">Baixa (L - 7%)</option>
                    <option value="M">Média (M - 15%)</option>
                    <option value="Q">Alta (Q - 25%)</option>
                    <option value="H">Máxima (H - 30%)</option>
                  </SelectInput>
                )}
              </Field>

              <Field label="Margem (0–10)" htmlFor="qr-margin">
                {({ inputId }) => (
                  <TextInput
                    id={inputId}
                    type="number"
                    min={0}
                    max={10}
                    value={style.margin}
                    onChange={(e) => setStyle({ ...style, margin: Number(e.target.value) })}
                  />
                )}
              </Field>
            </div>

            <Field label="Legenda da moldura (opcional)" htmlFor="qr-frame">
              {({ inputId }) => (
                <TextInput
                  id={inputId}
                  type="text"
                  maxLength={32}
                  placeholder="Ex: ESCANEIE AQUI"
                  value={style.frameLabel ?? ''}
                  onChange={(e) => setStyle({ ...style, frameLabel: e.target.value })}
                />
              )}
            </Field>

            {error && <Alert tone="error">{error}</Alert>}
            {savedMsg && <Alert tone="success">{savedMsg}</Alert>}

            <div>
              <Button type="submit" variant="primary" disabled={saving}>
                <Save size={17} aria-hidden="true" />
                <span>{saving ? 'Salvando...' : initialQr ? 'Atualizar QR Dinâmico' : 'Criar QR Dinâmico'}</span>
              </Button>
            </div>
          </form>
        </Tile>
      </BentoGrid>
    </FeatureGate>
  );
}
