'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Spinner } from '@/components/ui/Spinner';
import { useState } from 'react';

interface ImportHistoryRow {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  recordsTotal: number;
  recordsImported: number;
  recordsFailed: number;
  recordsSkipped: number;
  startedAt: string;
  completedAt: string | null;
  importedBy: {
    firstName: string;
    lastName: string;
  } | null;
}

function useImportHistory(page: number) {
  return useQuery<{ data: ImportHistoryRow[], meta: { total: number } }>({
    queryKey: ['import-history', page],
    queryFn: async () => {
      const res = await apiClient.get('/leads/import-history', { params: { page, limit: 10 } });
      return res.data;
    },
  });
}

export default function ImportHistoryPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useImportHistory(page);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Import History</h2>
        <p className="text-sm text-text-tertiary mt-0.5">
          View the history of CSV imports and their status.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-bg-elevated overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        )}

        {error && (
          <div className="py-16 text-center">
            <p className="text-text-tertiary text-sm">Could not load import history.</p>
          </div>
        )}

        {data && data.data.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-text-tertiary text-sm">No imports found.</p>
          </div>
        )}

        {data && data.data.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-base">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    File Name
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    Imported By
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    Imported / Failed / Skipped
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((h) => (
                  <tr
                    key={h.id}
                    className="border-b border-border/50 last:border-0 hover:bg-bg-subtle/30 transition-colors"
                  >
                    <td className="px-5 py-3.5 font-medium text-text-primary">
                      {h.fileName}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs ${
                        h.status === 'COMPLETED' ? 'text-green-400' :
                        h.status === 'FAILED' ? 'text-red-400' :
                        'text-amber-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          h.status === 'COMPLETED' ? 'bg-green-400' :
                          h.status === 'FAILED' ? 'bg-red-400' :
                          'bg-amber-400'
                        }`} />
                        {h.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-text-secondary">
                      {h.importedBy ? `${h.importedBy.firstName} ${h.importedBy.lastName}` : 'System'}
                    </td>
                    <td className="px-5 py-3.5 text-right text-text-secondary">
                      <span className="text-green-400">{h.recordsImported}</span> / <span className="text-red-400">{h.recordsFailed}</span> / <span className="text-text-tertiary">{h.recordsSkipped}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-text-tertiary">
                      {new Date(h.startedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.meta.total > 10 && (
              <div className="border-t border-border px-5 py-3 flex items-center justify-between">
                <div className="flex gap-2 text-sm">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 bg-bg-subtle rounded disabled:opacity-50">Prev</button>
                  <span className="px-2 py-1">Page {page}</span>
                  <button onClick={() => setPage(p => p + 1)} disabled={page * 10 >= data.meta.total} className="px-3 py-1 bg-bg-subtle rounded disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
