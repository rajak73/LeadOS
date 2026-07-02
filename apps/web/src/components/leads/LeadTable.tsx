'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLeads } from '@/lib/hooks/useLeads';
import { usePatchLead } from '@/lib/hooks/useLeadActions';
import { useLeadsStore } from '@/lib/store/leads-store';
import { LeadStatusBadge } from './LeadStatusBadge';
import { LeadScoreBadge } from './LeadScoreBadge';
import { LeadScorePopover } from './LeadScorePopover';
import { BulkActionBar } from './BulkActionBar';
import { Skeleton } from '@/components/ui/Skeleton';
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
      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 transition-colors"
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
      className="text-xs rounded-md px-1.5 py-0.5 border border-slate-200 bg-slate-50 text-slate-900 focus:outline-none focus:border-primary-500 transition-colors cursor-pointer"
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
  const [selectedLeadScoreId, setSelectedLeadScoreId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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

  // Checkbox selection helpers
  const allSelected = leads.length > 0 && leads.every((l) => selectedIds.includes(l.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(leads.map((l) => l.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  return (
    <div className="space-y-4" data-testid="lead-table">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
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
      <div className="overflow-x-auto border border-slate-300 rounded-xl bg-slate-50 ring-1 ring-slate-200 shadow-sm max-h-[70vh] relative">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 shadow-sm">
            <tr className="border-b border-slate-300 bg-white/95 backdrop-blur-md">
              {/* Select-all checkbox */}
              <th scope="col" className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleSelectAll}
                  aria-label="Select all leads"
                  className="w-4 h-4 rounded border-slate-200 text-primary-500 focus:ring-primary-500 cursor-pointer"
                />
              </th>
              <th scope="col" className="text-left px-4 py-3">
                <SortButton
                  label="Name"
                  col="firstName"
                  current={filters.sortBy}
                  order={filters.sortOrder}
                  onSort={handleSort}
                />
              </th>
              <th scope="col" className="text-left px-4 py-3 text-xs text-slate-500 font-medium">Email</th>
              <th scope="col" className="text-left px-4 py-3 text-xs text-slate-500 font-medium">Source</th>
              <th scope="col" className="text-left px-4 py-3 text-xs text-slate-500 font-medium">Status</th>
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
                <td colSpan={7} className="p-0">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-6 px-4 py-4 border-b border-slate-200/30">
                       <Skeleton className="w-4 h-4 rounded" />
                       <Skeleton className="w-32 h-4" />
                       <Skeleton className="w-40 h-4 hidden sm:block" />
                       <Skeleton className="w-24 h-4" />
                       <Skeleton className="w-20 h-4" />
                       <Skeleton className="w-16 h-4" />
                    </div>
                  ))}
                </td>
              </tr>
            )}
            {!isLoading && leads.length === 0 && (
              <TableEmptyState
                colSpan={7}
                icon="👤"
                title="No leads found"
                description="Try adjusting your filters or add a new lead."
              />
            )}
            {leads.map((lead) => {
              const isSelected = selectedIds.includes(lead.id);
              return (
                <tr
                  key={lead.id}
                  className={`border-b border-slate-200 last:border-0 transition-colors
                    ${isSelected ? 'bg-primary-500/10' : 'hover:bg-slate-50/80'}`}
                  data-testid={`lead-row-${lead.id}`}
                >
                  <td className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectOne(lead.id)}
                      aria-label={`Select ${getLeadDisplayName(lead)}`}
                      className="w-4 h-4 rounded border-slate-200 text-primary-500 focus:ring-primary-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <AvatarInitials name={getLeadDisplayName(lead)} size="sm" />
                      <div className="min-w-0">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="font-medium text-slate-900 hover:text-primary-400 transition-colors"
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
                  <td className="px-4 py-3 text-slate-600 text-xs">{lead.email ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{formatLeadSource(lead.source)}</td>
                  <td className="px-4 py-3">
                    <InlineStatusEdit lead={lead} />
                  </td>
                  <td className="px-4 py-3">
                    <LeadScoreBadge
                      score={lead.aiScore}
                      onClick={() => setSelectedLeadScoreId(lead.id)}
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatRelativeTime(lead.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500" data-testid="pagination">
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
      {selectedLeadScoreId && (
        <LeadScorePopover
          leadId={selectedLeadScoreId}
          open={!!selectedLeadScoreId}
          onOpenChange={(open) => {
            if (!open) setSelectedLeadScoreId(null);
          }}
        />
      )}

      {/* Bulk action bar — floats when rows are selected */}
      <BulkActionBar
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedIds([])}
      />
    </div>
  );
}
