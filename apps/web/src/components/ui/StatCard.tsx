import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  subtext?: string;
  icon?: string;
}

export function StatCard({ label, value, subtext, icon }: StatCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
      <div className="flex items-center gap-2">
        {icon && <span className="text-base select-none" aria-hidden="true">{icon}</span>}
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-semibold text-slate-900 tabular-nums">{value}</p>
      {subtext && <p className="text-xs text-slate-600">{subtext}</p>}
    </div>
  );
}
