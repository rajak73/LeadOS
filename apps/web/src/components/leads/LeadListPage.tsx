'use client';

import { useState } from 'react';
import { LeadFilters } from './LeadFilters';
import { LeadTable } from './LeadTable';
import { ViewBar } from './ViewBar';
import { CsvImportModal } from './CsvImportModal';
import { apiClient } from '@/lib/api-client';
import { useLeadsStore } from '@/lib/store/leads-store';

// Export pollingExport is client-only — triggers download via Blob URL.
async function triggerExport(filters: Record<string, unknown>) {
  const res = await apiClient.post<{ data: { jobId: string } }>('/leads/export', filters);
  const jobId = res.data.data.jobId;
  // Poll until DONE.
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await apiClient.get<{ data: { status: string; downloadUrl?: string } }>(
      `/leads/export/${jobId}`,
    );
    const job = poll.data.data;
    if (job.status === 'DONE' && job.downloadUrl) {
      const a = document.createElement('a');
      a.href = job.downloadUrl;
      a.download = 'leads.csv';
      a.click();
      return;
    }
    if (job.status === 'FAILED') throw new Error('Export failed');
  }
  throw new Error('Export timed out');
}

export function LeadListPage() {
  const [importOpen, setImportOpen] = useState(false);
  const { filters } = useLeadsStore();

  const handleExport = () => {
    void triggerExport(filters as Record<string, unknown>).catch((e: unknown) =>
      console.error('Export error', e),
    );
  };

  return (
    <div className="space-y-5" data-testid="lead-list-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Leads</h1>
      </div>

      {/* Saved views bar */}
      <ViewBar />

      <LeadFilters />
      <LeadTable onImport={() => setImportOpen(true)} onExport={handleExport} />

      <CsvImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
