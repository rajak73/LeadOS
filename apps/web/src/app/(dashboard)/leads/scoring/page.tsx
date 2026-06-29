'use client';

import { useEffect } from 'react';
import { LeadTable } from '@/components/leads/LeadTable';
import { useLeadsStore } from '@/lib/store/leads-store';
import { LeadFilters } from '@/components/leads/LeadFilters';

export default function LeadScoringDashboard() {
  const { setFilters } = useLeadsStore();

  useEffect(() => {
    setFilters({ sortBy: 'aiScore', sortOrder: 'desc' });
  }, [setFilters]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">AI Lead Ranking</h1>
          <p className="text-sm text-text-tertiary mt-1">
            Prioritize your follow-ups based on real-time AI engagement scores.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-bg-elevated border border-border rounded-xl flex items-start gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-full bg-primary-500/10 text-primary-500 flex items-center justify-center shrink-0">
            <span className="text-xl">↑</span>
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">Top Scoring Leads</h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              Focus your immediate attention here. These leads have high engagement and positive buying signals.
            </p>
          </div>
        </div>
        <div className="p-4 bg-bg-elevated border border-border rounded-xl flex items-start gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-full bg-yellow-500/10 text-yellow-500 flex items-center justify-center shrink-0">
            <span className="text-xl">!</span>
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">Needs Attention</h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              High-score leads with no recent activity or stalled pipelines. Re-engage immediately.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-bg-elevated border border-border rounded-xl p-4 shadow-sm">
        <LeadFilters />
        <div className="mt-4">
          <LeadTable onImport={() => {}} onExport={() => {}} />
        </div>
      </div>
    </div>
  );
}
