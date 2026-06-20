'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AnimatePresence, motion } from 'framer-motion';
import { DealCard } from './DealCard';
import { EmptyColumn } from './EmptyColumn';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/types/api';
import type { Deal, PipelineStage } from '@/lib/types/api';

interface KanbanColumnProps {
  stage: PipelineStage;
  deals: Deal[];
  onAddDeal: (stageId: string) => void;
  onMarkWon: (dealId: string) => void;
  onMarkLost: (dealId: string) => void;
}

export function KanbanColumn({ stage, deals, onAddDeal, onMarkWon, onMarkLost }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage.id}` });

  const totalValue = deals.reduce((sum, d) => sum + (d.value ? Number(d.value) : 0), 0);

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          {stage.color && (
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
          )}
          <h3 className="text-sm font-medium text-text-primary">{stage.name}</h3>
          <span className="text-xs text-text-tertiary bg-bg-subtle px-1.5 py-0.5 rounded">
            {deals.length}
          </span>
        </div>
        <motion.span layout className="text-xs text-text-tertiary">
          {totalValue > 0 ? formatCurrency(totalValue) : ''}
        </motion.span>
      </div>

      {/* Droppable column body */}
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-xl p-2 min-h-[200px] transition-colors ${
          isOver ? 'bg-primary-500/10 border border-primary-500/30' : 'bg-bg-subtle/50'
        }`}
      >
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          <AnimatePresence mode="popLayout">
            {deals.map((deal) => (
              <motion.div
                key={deal.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="mb-2"
              >
                <DealCard deal={deal} onMarkWon={onMarkWon} onMarkLost={onMarkLost} />
              </motion.div>
            ))}
          </AnimatePresence>
        </SortableContext>

        {deals.length === 0 && (
          <EmptyColumn stageName={stage.name} onAddDeal={() => onAddDeal(stage.id)} />
        )}
      </div>

      <Button size="sm" variant="ghost" className="mt-2 w-full justify-start text-text-tertiary" onClick={() => onAddDeal(stage.id)}>
        + Add Deal
      </Button>
    </div>
  );
}
