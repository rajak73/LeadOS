'use client';

interface BadgeProps {
  variant?: 'default' | 'overdue' | 'stale' | 'won' | 'lost' | 'open';
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<string, string> = {
  default: 'bg-white text-slate-600 border border-slate-200',
  overdue: 'bg-red-500/15 text-red-400 border border-red-500/30',
  stale: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  won: 'bg-green-500/15 text-green-400 border border-green-500/30',
  lost: 'bg-red-500/15 text-red-400 border border-red-500/30',
  open: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
};

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
