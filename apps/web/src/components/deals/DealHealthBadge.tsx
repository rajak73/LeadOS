'use client';

import { Badge } from '@/components/ui/Badge';
import { getDealHealth } from '@/lib/types/api';
import type { Deal } from '@/lib/types/api';

interface DealHealthBadgeProps {
  deal: Deal;
  verbose?: boolean;
}

export function DealHealthBadge({ deal, verbose = false }: DealHealthBadgeProps) {
  const health = getDealHealth(deal);
  if (health.length === 0) return null;

  const staleDays = deal.updatedAt
    ? Math.floor((Date.now() - new Date(deal.updatedAt).getTime()) / 86_400_000)
    : 0;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {health.includes('overdue') && (
        <Badge variant="overdue" data-testid="badge-overdue">
          {verbose ? `Overdue (expected ${deal.expectedCloseDate?.split('T')[0] ?? ''})` : 'OVERDUE'}
        </Badge>
      )}
      {health.includes('stale') && (
        <Badge variant="stale" data-testid="badge-stale">
          {verbose ? `No activity for ${staleDays}d` : `${staleDays}d`}
        </Badge>
      )}
    </div>
  );
}
