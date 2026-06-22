'use client';

import Link from 'next/link';
import { useLeads } from '@/lib/hooks/useLeads';
import { usePatchLead } from '@/lib/hooks/useLeadActions';
import { useLeadsStore } from '@/lib/store/leads-store';
import { LeadStatusBadge } from './LeadStatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { AvatarInitials } from '@/components/ui/AvatarInitials';
import { TableEmptyState } from '@/components/ui/EmptyState';
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
      aria-label={`Status for ${lead.firstName}`}
      data-testid={`status-select-${lead.id}`}
      className="text-xs rounded-md px-1.5 py-0.5 border border-border bg-bg-base text-text-primary focus:outline-none focus:border-primary-500 transition-colors cursor-pointer"
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
          <Button
            variant="secondary"
            size="sm"
            onClick={onImport}
            data-testid="btn-import-csv"
          >
            Import CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onExport}
            data-testid="btn-export-csv"
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-elevated">
              <th scope="col" className="text-left px-4 py-3">
                <SortButton
                  label="Name"
                  col="firstName"
                  current={filters.sortBy}
                  order={filters.sortOrder}
                  onSort={handleSort}
                />
              </th>
              <th scope="col" className="text-left px-4 py-3 text-xs text-text-tertiary font-medium">Email</th>
              <th scope="col" className="text-left px-4 py-3 text-xs text-text-tertiary font-medium">Source</th>
              <th scope="col" className="text-left px-4 py-3 text-xs text-text-tertiary font-medium">Status</th>
              <th scope="col" className="text-left px-4 py-3">
                <SortButton
                  label="AI Score"
                  col="aiScore"
                  current={filters.sortBy}
                  order={filters.sortOrder}
                  onSort={handleSort}
                />
              </th>
              <th scope="col" className="text-left px-4 py-3">
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
              <TableEmptyState
                colSpan={6}
                icon="👤"
                title="No leads found"
                description="Try adjusting your filters or add a new lead."
              />
            )}
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className="border-b border-border/50 last:border-0 hover:bg-bg-elevated/50 transition-colors"
                data-testid={`lead-row-${lead.id}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <AvatarInitials name={getLeadDisplayName(lead)} size="sm" />
                    <div className="min-w-0">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-medium text-text-primary hover:text-primary-400 transition-colors"
                      >
                        {getLeadDisplayName(lead)}
                      </Link>
                      {lead.tags.length > 0 && (
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {lead.tags.slice(0, 3).map((t) => (
                            <Badge key={t} variant="default" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-text-secondary text-xs">{lead.email ?? '—'}</td>
                <td className="px-4 py-3 text-text-secondary text-xs">{formatLeadSource(lead.source)}</td>
                <td className="px-4 py-3">
                  <InlineStatusEdit lead={lead} />
                </td>
                <td className="px-4 py-3 text-text-secondary text-xs">
                  {lead.aiScore !== null ? (
                    <span
                      className={`font-medium ${
                        lead.aiScore >= 70
                          ? 'text-green-400'
                          : lead.aiScore >= 40
                            ? 'text-yellow-400'
                            : 'text-text-secondary'
                      }`}
                    >
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
            <Button
              variant="ghost"
              size="sm"
              disabled={meta.page <= 1}
              onClick={() => handlePageChange(meta.page - 1)}
              data-testid="btn-prev-page"
            >
              ‹
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={meta.page >= meta.totalPages}
              onClick={() => handlePageChange(meta.page + 1)}
              data-testid="btn-next-page"
            >
              ›
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
