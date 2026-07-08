'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Spinner } from '@/components/ui/Spinner';
import { formatCurrency } from '@/lib/types/api';
import type { Deal } from '@/lib/types/api';

interface LinkedDealsPanelProps {
  leadId: string;
}

export function LinkedDealsPanel({ leadId }: LinkedDealsPanelProps) {
  const { data: deals, isLoading } = useQuery<Deal[]>({
    queryKey: ['deals-for-lead', leadId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Deal[] }>('/deals', {
        params: { leadId, status: 'OPEN', limit: 25 },
      });
      return res.data.data;
    },
    staleTime: 30_000,
  });

  return (
    <div className="space-y-2" data-testid="linked-deals-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-900">Linked Deals</h3>
        <Link
          href={`/pipeline?createDeal=1&leadId=${leadId}`}
          className="text-xs text-primary-400 hover:underline"
          data-testid="btn-create-deal"
        >
          + Create Deal
        </Link>
      </div>

      {isLoading && (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      )}

      {!isLoading && (!deals || deals.length === 0) && (
        <p className="text-xs text-slate-500 py-2">No open deals linked to this lead</p>
      )}

      {deals?.map((deal) => (
        <Link
          key={deal.id}
          href={`/pipeline/deals/${deal.id}`}
          className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:border-slate-200/80 hover:bg-white/50 transition-colors"
          data-testid={`linked-deal-${deal.id}`}
        >
          <span className="text-sm text-slate-900 truncate">{deal.title}</span>
          <span className="text-xs text-slate-500 shrink-0 ml-2">
            {formatCurrency(deal.value, deal.currency)}
          </span>
        </Link>
      ))}
    </div>
  );
}
