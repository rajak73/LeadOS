import type { LeadStatus } from '@/lib/types/api';
import { formatLeadStatus } from '@/lib/types/api';

const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  CONTACTED: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  QUALIFIED: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  PROPOSAL: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  NEGOTIATION: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  WON: 'bg-green-500/15 text-green-400 border-green-500/30',
  LOST: 'bg-red-500/15 text-red-400 border-red-500/30',
};

interface LeadStatusBadgeProps {
  status: LeadStatus;
  className?: string;
}

export function LeadStatusBadge({ status, className = '' }: LeadStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLES[status]} ${className}`}
      data-testid={`status-badge-${status}`}
    >
      {formatLeadStatus(status)}
    </span>
  );
}
