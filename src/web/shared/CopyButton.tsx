import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from './ui/index.ts';

export function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={handleCopy}>
        {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        <span>{copied ? 'Copiado!' : label}</span>
      </Button>
      <span className="visually-hidden" aria-live="polite">
        {copied ? 'Link copiado para a área de transferência.' : ''}
      </span>
    </>
  );
}
