'use client';

import Link from 'next/link';
import { useLeads } from '@/lib/hooks/useLeads';
import { usePatchLead } from '@/lib/hooks/useLeadActions';
import { useLeadsStore } from '@/lib/store/leads-store';
import { LeadStatusBadge } from './LeadStatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import {
  ALL_LEAD_STATUSES,
  LEAD_STATUS_TRANSITIONS,
  formatLeadSource,
  formatRelativeTime,
  getLeadDisplayName,
} from '@/lib/types/api';
import type { Lead, LeadStatus } from '@/lib/types/api';

type SortKey = 'firstName' | 'createdAt' | 'aiScore';

function SortButton({
  label,
  col,
  current,
  order,
  onSort,
}: {
  label: string;
  col: SortKey;
  current: SortKey | undefined;
  order: 'asc' | 'desc' | undefined;
  onSort: (col: SortKey) => void;
}) {
  const active = current === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      data-testid={`sort-${col}`}
      className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary transition-colors"
    >
      {label}
      {active && <span className="text-primary-400">{order === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );
}

function InlineStatusEdit({ lead }: { lead: Lead }) {
  const { mutate: patch } = usePatchLead(lead.id);
  const allowed = LEAD_STATUS_TRANSITIONS[lead.status];

  if (allowed.length === 0) return <LeadStatusBadge status={lead.status} />;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as LeadStatus;
    if (next !== lead.status) patch({ status: next });
  };

  return (
    <select
      value={lead.status}
      onChange={handleChange}
      data-testid={`status-select-${lead.id}`}
      className="text-xs rounded px-1 py-0.5 border border-border bg-bg-base text-text-primary focus:outline-none focus:border-primary-500"
    >
      <option value={lead.status}>{lead.status}</option>
      {ALL_LEAD_STATUSES.filter((s) => allowed.includes(s)).map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

interface LeadTableProps {
  onImport: () => void;
  onExport: () => void;
}

export function LeadTable({ onImport, onExport }: LeadTableProps) {
  const { filters, setFilters } = useLeadsStore();
  const { data, isLoading } = useLeads(filters);

  const leads = data?.data ?? [];
  const meta = data?.meta;

  const handleSort = (col: SortKey) => {
    if (filters.sortBy === col) {
      setFilters({ sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      setFilters({ sortBy: col, sortOrder: 'desc' });
    }
  };

  const handlePageChange = (page: number) => setFilters({ page });

  return (
    <div className="space-y-4" data-testid="lead-table">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-tertiary">
          {meta ? `${meta.total} lead${meta.total !== 1 ? 's' : ''}` : '—'}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onImport}
            data-testid="btn-import-csv"
            className="px-3 py-1.5 text-xs border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-border/80 transition-colors"
          >
            Import CSV
          </button>
          <button
            type="button"
            onClick={onExport}
            data-testid="btn-export-csv"
            className="px-3 py-1.5 text-xs border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-border/80 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-elevated">
              <th className="text-left px-4 py-3">
                <SortButton
                  label="Name"
                  col="firstName"
                  current={filters.sortBy}
                  order={filters.sortOrder}
                  onSort={handleSort}
                />
              </th>
              <th className="text-left px-4 py-3 text-xs text-text-tertiary font-medium">Email</th>
              <th className="text-left px-4 py-3 text-xs text-text-tertiary font-medium">Source</th>
              <th className="text-left px-4 py-3 text-xs text-text-tertiary font-medium">Status</th>
              <th className="text-left px-4 py-3">
                <SortButton
                  label="AI Score"
                  col="aiScore"
                  current={filters.sortBy}
                  order={filters.sortOrder}
                  onSort={handleSort}
                />
              </th>
              <th className="text-left px-4 py-3">
                <SortButton
                  label="Created"
                  col="createdAt"
                  current={filters.sortBy}
                  order={filters.sortOrder}
                  onSort={handleSort}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <Spinner />
                </td>
              </tr>
            )}
            {!isLoading && leads.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-text-tertiary">
                  No leads found
                </td>
              </tr>
            )}
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className="border-b border-border/50 last:border-0 hover:bg-bg-elevated/50 transition-colors"
                data-testid={`lead-row-${lead.id}`}
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/leads/${lead.id}`}
                    className="font-medium text-text-primary hover:text-primary-400 transition-colors"
                  >
                    {getLeadDisplayName(lead)}
                  </Link>
                  {lead.tags.length > 0 && (
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {lead.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 bg-bg-subtle border border-border rounded text-text-tertiary">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-text-secondary text-xs">{lead.email ?? '—'}</td>
                <td className="px-4 py-3 text-text-secondary text-xs">{formatLeadSource(lead.source)}</td>
                <td className="px-4 py-3">
                  <InlineStatusEdit lead={lead} />
                </td>
                <td className="px-4 py-3 text-text-secondary text-xs">
                  {lead.aiScore !== null ? (
                    <span className={`font-medium ${lead.aiScore >= 70 ? 'text-green-400' : lead.aiScore >= 40 ? 'text-yellow-400' : 'text-text-secondary'}`}>
                      {lead.aiScore}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-text-tertiary text-xs">{formatRelativeTime(lead.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-text-tertiary" data-testid="pagination">
          <span>
            Page {meta.page} of {meta.totalPages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={meta.page <= 1}
              onClick={() => handlePageChange(meta.page - 1)}
              data-testid="btn-prev-page"
              className="px-2 py-1 border border-border rounded disabled:opacity-40 hover:border-border/80 transition-colors"
            >
              ‹
            </button>
            <button
              type="button"
              disabled={meta.page >= meta.totalPages}
              onClick={() => handlePageChange(meta.page + 1)}
              data-testid="btn-next-page"
              className="px-2 py-1 border border-border rounded disabled:opacity-40 hover:border-border/80 transition-colors"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
