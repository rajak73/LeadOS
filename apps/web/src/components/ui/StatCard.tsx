import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  subtext?: string;
  icon?: string;
}

export function StatCard({ label, value, subtext, icon }: StatCardProps) {
  return (
    <div className="bg-bg-elevated border border-border rounded-xl p-5 space-y-2">
      <div className="flex items-center gap-2">
        {icon && <span className="text-base select-none" aria-hidden="true">{icon}</span>}
        <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-semibold text-text-primary tabular-nums">{value}</p>
      {subtext && <p className="text-xs text-text-secondary">{subtext}</p>}
    </div>
  );
}
