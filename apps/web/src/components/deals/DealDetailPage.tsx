'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DealMetadataForm } from './DealMetadataForm';
import { StageTimeline } from './StageTimeline';
import { ActivityFeed } from './ActivityFeed';
import { DealHealthBadge } from './DealHealthBadge';
import { LostReasonModal } from '@/components/kanban/LostReasonModal';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useDealDetail } from '@/lib/hooks/useDealDetail';
import { useMarkWon } from '@/lib/hooks/useDealActions';
import { usePipelines } from '@/lib/hooks/usePipelines';
import { useToast } from '@/components/ui/Toast';
import { usePipelineStore } from '@/lib/store/pipeline-store';
import type { Deal } from '@/lib/types/api';

interface DealDetailPageProps {
  dealId: string;
  initialDeal?: Deal;
}

export function DealDetailPage({ dealId, initialDeal }: DealDetailPageProps) {
  const { data: deal, isLoading } = useDealDetail(dealId, initialDeal);
  const { data: pipelines } = usePipelines();
  const { activePipelineId } = usePipelineStore();
  // Use deal.pipelineId directly so optimistic board update works even when navigating
  // to a deal URL directly (activePipelineId is null until the Kanban page initialises).
  const { mutate: markWon, isPending: wonPending } = useMarkWon(deal?.pipelineId ?? null);
  const { toast } = useToast();
  const [lostModalOpen, setLostModalOpen] = useState(false);

  if (isLoading || !deal) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  const pipeline = pipelines?.find((p) => p.id === deal.pipelineId) ?? null;

  const handleMarkWon = () => {
    markWon(deal.id, {
      onSuccess: () => toast('Deal marked as Won', 'success'),
      onError: () => toast('Failed to mark won', 'error'),
    });
  };

  const tabs = [
    { value: 'activity', label: 'Activity', content: <ActivityFeed dealId={deal.id} /> },
    {
      value: 'notes',
      label: 'Notes',
      content: (
        <EmptyState
          icon="📝"
          title="No notes yet"
          description="Notes for this deal will appear here once the Notes module ships in a future sprint."
        />
      ),
    },
    {
      value: 'files',
      label: 'Files',
      content: (
        <EmptyState
          icon="📎"
          title="No files attached"
          description="File uploads for this deal will be available in a future sprint."
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full" data-testid="deal-detail-page">
      {/* Back nav */}
      <div className="lg:hidden">
        <Link href="/pipeline" className="text-sm text-slate-600 hover:text-slate-900">
          ← Back to Pipeline
        </Link>
      </div>

      {/* Left panel — 60% */}
      <div className="flex-[3] min-w-0 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/pipeline" className="hidden lg:inline text-sm text-slate-600 hover:text-slate-900">
            ← Back
          </Link>
          <DealHealthBadge deal={deal} verbose />
        </div>

        <StageTimeline deal={deal} pipeline={pipeline} onMarkWon={handleMarkWon} />
        <DealMetadataForm deal={deal} />

        {/* Won/Lost CTA */}
        {deal.status === 'OPEN' && (
          <div className="flex gap-2 pt-2 border-t border-slate-200">
            <Button
              variant="primary"
              onClick={handleMarkWon}
              disabled={wonPending}
              data-testid="btn-mark-won"
            >
              ✓ Mark Won
            </Button>
            <Button
              variant="danger"
              onClick={() => setLostModalOpen(true)}
              data-testid="btn-mark-lost"
            >
              ✗ Mark Lost
            </Button>
          </div>
        )}

        {deal.status !== 'OPEN' && (
          <div className={`rounded-lg p-3 text-sm font-medium ${
            deal.status === 'WON' ? 'bg-green-500/15 text-green-400 border border-green-500/30' : 'bg-red-500/15 text-red-400 border border-red-500/30'
          }`}>
            {deal.status === 'WON' ? '🏆 Deal Won' : '✗ Deal Lost'}
          </div>
        )}
      </div>

      {/* Right panel — 40% */}
      <div className="flex-[2] min-w-0 min-h-[400px] lg:min-h-0 border border-slate-200 rounded-xl overflow-hidden">
        <Tabs defaultValue="activity" tabs={tabs} />
      </div>

      <LostReasonModal
        open={lostModalOpen}
        dealId={deal.id}
        pipelineId={activePipelineId}
        onClose={() => setLostModalOpen(false)}
      />
    </div>
  );
}
