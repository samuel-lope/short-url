import type { ReactNode } from 'react';
import { Tile } from './BentoGrid.tsx';

export function StatTile({
  label,
  value,
  icon,
  variant = 'default',
  c = 1,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  variant?: 'default' | 'accent' | 'muted';
  c?: 1 | 2;
}) {
  return (
    <Tile c={c} variant={variant} className="stat-tile" as="div">
      <div className="stat-top">
        <span>{label}</span>
        {icon}
      </div>
      <div className="stat-value">{value}</div>
    </Tile>
  );
}
