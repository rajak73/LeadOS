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
            <span className="inline-block w-2.5 h-2.5 rounded-full ring-2 ring-bg-base shadow-sm" style={{ backgroundColor: stage.color }} />
          )}
          <h3 className="text-sm font-semibold text-text-primary">{stage.name}</h3>
          <span className="text-[10px] font-bold text-text-secondary bg-bg-subtle ring-1 ring-border-strong px-2 py-0.5 rounded-full">
            {deals.length}
          </span>
        </div>
        <motion.span layout className="text-[10px] font-mono font-semibold text-primary-400 bg-primary-500/10 ring-1 ring-primary-500/20 px-2.5 py-0.5 rounded-md">
          {totalValue > 0 ? formatCurrency(totalValue) : '$0'}
        </motion.span>
      </div>

      {/* Droppable column body */}
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-2xl p-3 min-h-[200px] transition-all border shadow-inner ${
          isOver ? 'bg-primary-500/5 border-primary-500/30 ring-1 ring-primary-500/20' : 'bg-bg-base/40 border-border-strong ring-1 ring-white/5'
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
