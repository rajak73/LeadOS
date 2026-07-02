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
      className={`bg-white border rounded-xl p-3.5 cursor-grab active:cursor-grabbing group transition-all duration-200 ${
        isDragOverlay ? 'shadow-2xl ring-2 ring-primary-500 border-transparent z-50 scale-105' : 'border-slate-300 ring-1 ring-slate-200 hover:border-slate-300 hover:ring-primary-500/30 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <Link
          href={`/pipeline/deals/${deal.id}`}
          className="text-sm font-medium text-slate-900 hover:text-primary-500 line-clamp-2 flex-1"
          onClick={(e) => e.stopPropagation()}
        >
          {deal.title}
        </Link>
        {deal.value && Number(deal.value) > HIGH_VALUE_THRESHOLD && (
          <span className="text-yellow-400 shrink-0" title="High value">◆</span>
        )}
      </div>

      {deal.value && (
        <p className="text-xs text-slate-600 mb-2">{formatCurrency(deal.value, deal.currency)}</p>
      )}

      <DealHealthBadge deal={deal} />

      {deal.status === 'OPEN' && (
        <div className="mt-2 pt-2 border-t border-slate-200 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
