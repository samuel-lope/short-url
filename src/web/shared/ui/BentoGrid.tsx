import type { CSSProperties, ReactNode } from 'react';

export function BentoGrid({
  cols = 4,
  children,
  className = '',
  label,
}: {
  cols?: 2 | 3 | 4;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const colClass = cols === 2 ? 'bento--cols-2' : cols === 3 ? 'bento--cols-3' : '';
  return (
    <div className="bento-wrap">
      <div
        className={`bento ${colClass} ${className}`.trim()}
        role={label ? 'region' : undefined}
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}

export function Tile({
  c = 1,
  r = 1,
  variant = 'default',
  title,
  subtitle,
  action,
  as = 'article',
  className = '',
  children,
  ...rest
}: {
  c?: 1 | 2 | 3 | 4;
  r?: 1 | 2;
  variant?: 'default' | 'accent' | 'muted' | 'warning';
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  as?: 'article' | 'section' | 'div';
  className?: string;
  children: ReactNode;
  'aria-labelledby'?: string;
  'aria-label'?: string;
  'aria-live'?: 'polite' | 'assertive' | 'off';
}) {
  const Tag = as;
  const variantClass =
    variant === 'accent'
      ? 'tile--accent'
      : variant === 'muted'
        ? 'tile--muted'
        : variant === 'warning'
          ? 'tile--warning'
          : '';
  const style = { '--c': c, '--r': r } as CSSProperties;

  return (
    <Tag className={`tile ${variantClass} ${className}`.trim()} style={style} {...rest}>
      {(title || action) && (
        <header className="tile-header">
          <div>
            {title && <h2 className="tile-title">{title}</h2>}
            {subtitle && <p className="tile-subtitle">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </Tag>
  );
}
