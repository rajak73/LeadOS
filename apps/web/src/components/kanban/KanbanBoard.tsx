'use client';

import { useState, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KanbanColumn } from './KanbanColumn';
import { DealCard } from './DealCard';
import { PipelineSelector } from './PipelineSelector';
import { AddDealModal } from './AddDealModal';
import { LostReasonModal } from './LostReasonModal';
import { ForecastPanel } from '@/components/deals/ForecastPanel';
import { Spinner } from '@/components/ui/Spinner';
import { usePipelineStore } from '@/lib/store/pipeline-store';
import { usePipelines } from '@/lib/hooks/usePipelines';
import { useDeals } from '@/lib/hooks/useDeals';
import { useMoveDeal } from '@/lib/hooks/useMoveDeal';
import { useMarkWon } from '@/lib/hooks/useDealActions';
import { useToast } from '@/components/ui/Toast';
import type { Pipeline } from '@/lib/types/api';

interface KanbanBoardProps {
  initialPipelines?: Pipeline[];
}

export function KanbanBoard({ initialPipelines }: KanbanBoardProps) {
  const { data: pipelines } = usePipelines();
  const allPipelines = pipelines ?? initialPipelines ?? [];

  const {
    activePipelineId,
    setActivePipelineId,
    addDealModalOpen,
    addDealTargetStageId,
    openAddDealModal,
    closeAddDealModal,
    lostReasonModalOpen,
    lostReasonDealId,
    openLostReasonModal,
    closeLostReasonModal,
  } = usePipelineStore();

  // Initialise active pipeline from defaults
  useEffect(() => {
    if (!activePipelineId && allPipelines.length > 0) {
      const def = allPipelines.find((p) => p.isDefault) ?? allPipelines[0];
      if (def) setActivePipelineId(def.id);
    }
  }, [allPipelines, activePipelineId, setActivePipelineId]);

  const activePipeline = allPipelines.find((p) => p.id === activePipelineId) ?? null;
  const { data: deals = [], isLoading } = useDeals(activePipelineId);
  const { mutate: moveDeal } = useMoveDeal();
  const { mutate: markWon } = useMarkWon(activePipelineId);
  const { toast } = useToast();

  const [activeId, setActiveId] = useState<string | null>(null);
  // Mobile: index of the stage currently shown in the single-column view
  const [mobileStageIndex, setMobileStageIndex] = useState(0);

  const stages = activePipeline?.stages.slice().sort((a, b) => a.order - b.order) ?? [];

  // Reset mobile index when pipeline or stages change
  useEffect(() => {
    setMobileStageIndex(0);
  }, [activePipelineId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) ?? null : null;

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over || !activePipelineId) return;
    const toStageId = (over.id as string).replace('stage-', '');
    const deal = deals.find((d) => d.id === active.id);
    if (!deal || deal.stageId === toStageId) return;
    moveDeal(
      { dealId: deal.id, stageId: toStageId, pipelineId: activePipelineId },
      { onError: () => toast('Failed to move deal — position reverted', 'error') },
    );
  }

  function onDragCancel() {
    setActiveId(null);
  }

  const handleMarkWon = (dealId: string) => {
    markWon(dealId, {
      onSuccess: () => toast('Deal marked as Won', 'success'),
      onError: () => toast('Failed to mark deal as won', 'error'),
    });
  };

  const mobileStage = stages[mobileStageIndex] ?? null;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 shrink-0">
        <PipelineSelector
          pipelines={allPipelines}
          activePipelineId={activePipelineId ?? ''}
          onChange={setActivePipelineId}
        />
        {activePipeline && (
          <h2 className="text-sm font-medium text-slate-600 hidden md:block">{activePipeline.name}</h2>
        )}
      </div>

      {/* Forecast */}
      {activePipelineId && <ForecastPanel pipelineId={activePipelineId} />}

      {/* Board */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          {/* ── Mobile board: single column + prev/next navigation (< 768px) ── */}
          <div className="md:hidden flex flex-col gap-3">
            {stages.length > 1 && (
              <div className="flex items-center justify-between gap-2" data-testid="mobile-stage-nav">
                <button
                  type="button"
                  onClick={() => setMobileStageIndex((i) => Math.max(0, i - 1))}
                  disabled={mobileStageIndex === 0}
                  aria-label="Previous stage"
                  className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ‹
                </button>
                <span className="text-sm font-medium text-slate-900">
                  {mobileStage?.name ?? ''}
                  <span className="ml-1.5 text-slate-500 text-xs">
                    ({mobileStageIndex + 1} / {stages.length})
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setMobileStageIndex((i) => Math.min(stages.length - 1, i + 1))}
                  disabled={mobileStageIndex === stages.length - 1}
                  aria-label="Next stage"
                  className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ›
                </button>
              </div>
            )}
            {mobileStage && (
              <KanbanColumn
                stage={mobileStage}
                deals={deals.filter((d) => d.stageId === mobileStage.id)}
                onAddDeal={openAddDealModal}
                onMarkWon={handleMarkWon}
                onMarkLost={openLostReasonModal}
              />
            )}
          </div>

          {/* ── Desktop board: all columns, horizontal scroll (≥ 768px) ── */}
          <div className="hidden md:flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                deals={deals.filter((d) => d.stageId === stage.id)}
                onAddDeal={openAddDealModal}
                onMarkWon={handleMarkWon}
                onMarkLost={openLostReasonModal}
              />
            ))}
          </div>

          <DragOverlay>
            {activeDeal && (
              <div style={{ transform: 'scale(1.02)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <DealCard
                  deal={activeDeal}
                  onMarkWon={() => {}}
                  onMarkLost={() => {}}
                  isDragOverlay
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Modals */}
      {activePipelineId && addDealTargetStageId && (
        <AddDealModal
          open={addDealModalOpen}
          onClose={closeAddDealModal}
          pipelineId={activePipelineId}
          stageId={addDealTargetStageId}
        />
      )}
      <LostReasonModal
        open={lostReasonModalOpen}
        dealId={lostReasonDealId}
        pipelineId={activePipelineId}
        onClose={closeLostReasonModal}
      />
    </div>
  );
}
