'use client';

import { useMoveDeal } from '@/lib/hooks/useMoveDeal';
import { useToast } from '@/components/ui/Toast';
import type { Deal, Pipeline } from '@/lib/types/api';

interface StageTimelineProps {
  deal: Deal;
  pipeline: Pipeline | null;
  onMarkWon: () => void;
  onMarkLost?: () => void;
}

export function StageTimeline({ deal, pipeline, onMarkWon, onMarkLost }: StageTimelineProps) {
  const { mutate: moveDeal, isPending } = useMoveDeal();
  const { toast } = useToast();

  if (!pipeline) return null;

  const stages = [...pipeline.stages].sort((a, b) => a.order - b.order);

  const handleStageClick = (stageId: string) => {
    if (deal.status !== 'OPEN' || stageId === deal.stageId || isPending) return;
    const stage = stages.find((s) => s.id === stageId);
    if (stage?.isWon) {
      onMarkWon();
      return;
    }
    if (stage?.isLost) {
      onMarkLost?.();
      return;
    }
    moveDeal(
      { dealId: deal.id, stageId, pipelineId: deal.pipelineId },
      { onError: () => toast('Failed to move deal', 'error') },
    );
  };

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1" data-testid="stage-timeline">
      {stages.map((stage, idx) => {
        const isActive = stage.id === deal.stageId;
        const isPast = stages.slice(0, idx).some((s) => s.id === deal.stageId);
        const isClickable = deal.status === 'OPEN' && !isActive;

        return (
          <div key={stage.id} className="flex items-center gap-1">
            {idx > 0 && <div className="w-4 h-px bg-border shrink-0" />}
            <button
              onClick={() => handleStageClick(stage.id)}
              disabled={!isClickable}
              data-testid={`stage-btn-${stage.id}`}
              className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-primary-600 text-slate-900'
                  : isPast
                  ? 'bg-slate-50 text-slate-500 line-through'
                  : isClickable
                  ? 'bg-white text-slate-600 border border-slate-200 hover:border-primary-500 hover:text-primary-500 cursor-pointer'
                  : 'bg-white text-slate-500 border border-slate-200 cursor-default'
              }`}
            >
              {stage.name}
              {stage.probability !== null && !isActive && (
                <span className="ml-1 opacity-60">{stage.probability}%</span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
