'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import { DealHealthBadge } from '@/components/deals/DealHealthBadge';
import { Button } from '@/components/ui/Button';
import { formatCurrency, HIGH_VALUE_THRESHOLD } from '@/lib/types/api';
import type { Deal } from '@/lib/types/api';

interface DealCardProps {
  deal: Deal;
  onMarkWon: (dealId: string) => void;
  onMarkLost: (dealId: string) => void;
  isDragOverlay?: boolean;
}

export function DealCard({ deal, onMarkWon, onMarkLost, isDragOverlay = false }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
    disabled: deal.status !== 'OPEN',
  });

  const style = isDragOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      };

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={style}
      {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
      className={`bg-bg-elevated border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing group ${
        isDragOverlay ? 'shadow-2xl ring-1 ring-primary-500/40' : 'hover:border-border-strong'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <Link
          href={`/pipeline/deals/${deal.id}`}
          className="text-sm font-medium text-text-primary hover:text-primary-500 line-clamp-2 flex-1"
          onClick={(e) => e.stopPropagation()}
        >
          {deal.title}
        </Link>
        {deal.value && Number(deal.value) > HIGH_VALUE_THRESHOLD && (
          <span className="text-yellow-400 shrink-0" title="High value">◆</span>
        )}
      </div>

      {deal.value && (
        <p className="text-xs text-text-secondary mb-2">{formatCurrency(deal.value, deal.currency)}</p>
      )}

      <DealHealthBadge deal={deal} />

      {deal.status === 'OPEN' && (
        <div className="mt-2 pt-2 border-t border-border/50 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="ghost"
            className="text-green-400 hover:text-green-300 text-xs"
            onClick={(e) => { e.stopPropagation(); onMarkWon(deal.id); }}
          >
            Won
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-400 hover:text-red-300 text-xs"
            onClick={(e) => { e.stopPropagation(); onMarkLost(deal.id); }}
          >
            Lost
          </Button>
        </div>
      )}
    </div>
  );
}
