import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (ids: {
    inputId: string;
    describedBy: string | undefined;
    invalidClass: string;
  }) => ReactNode;
}

export function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
  const autoId = useId();
  const inputId = htmlFor ?? autoId;
  const hintId = `${inputId}-hint`;
  const errId = `${inputId}-err`;

  const describedBy =
    [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label htmlFor={inputId} className="field-label">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {hint && (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
      {children({
        inputId,
        describedBy,
        invalidClass: error ? 'user-invalid-fallback' : '',
      })}
      {error && (
        <div id={errId} className="field-error">
          <span role="img" aria-label="Erro">
            ❌
          </span>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { hero?: boolean }
>(function TextInput({ hero, className = '', ...props }, ref) {
  return (
    <input
      ref={ref}
      className={`input ${hero ? 'input--hero' : ''} ${className}`.trim()}
      {...props}
    />
  );
});

export function SelectInput({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={`select ${className}`.trim()} {...props}>
      {children}
    </select>
  );
}
