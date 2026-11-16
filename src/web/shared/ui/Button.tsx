import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

function getButtonClasses(variant: Variant, size: Size, extra = '') {
  const v =
    variant === 'primary'
      ? 'btn--primary'
      : variant === 'ghost'
        ? 'btn--ghost'
        : variant === 'danger'
          ? 'btn--danger'
          : '';
  const s = size === 'sm' ? 'btn--sm' : '';
  return `btn ${v} ${s} ${extra}`.trim();
}

export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <button type={type} className={getButtonClasses(variant, size, className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...props
}: LinkProps & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <Link className={getButtonClasses(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
