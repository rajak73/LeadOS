'use client';

import { useState } from 'react';
import { useBulkLeads } from '@/lib/hooks/useBulkLeads';
import { ALL_LEAD_STATUSES } from '@/lib/types/api';
import type { LeadStatus } from '@/lib/types/api';

interface BulkActionBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
}

export function BulkActionBar({ selectedIds, onClearSelection }: BulkActionBarProps) {
  const { mutate: bulkAction, isPending } = useBulkLeads();
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const count = selectedIds.length;
  if (count === 0) return null;

  const handleStatusChange = (status: LeadStatus) => {
    bulkAction(
      { action: 'update-status', ids: selectedIds, status },
      { onSuccess: () => { setShowStatusMenu(false); onClearSelection(); } }
    );
  };

  const handleAddTags = () => {
    const tags = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length === 0) return;
    bulkAction(
      { action: 'add-tags', ids: selectedIds, tags },
      { onSuccess: () => { setShowTagInput(false); setTagInput(''); onClearSelection(); } }
    );
  };

  const handleDelete = () => {
    if (!window.confirm(`Delete ${count} lead${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    bulkAction(
      { action: 'delete', ids: selectedIds },
      { onSuccess: () => onClearSelection() }
    );
  };

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3
                 bg-bg-elevated border border-border rounded-2xl shadow-2xl shadow-black/40
                 backdrop-blur-xl animate-in slide-in-from-bottom-4 duration-300"
      data-testid="bulk-action-bar"
    >
      {/* Selection badge */}
      <div className="flex items-center gap-2 pr-3 border-r border-border">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-500 text-white text-xs font-bold">
          {count}
        </span>
        <span className="text-sm text-text-secondary font-medium">
          {count === 1 ? 'lead' : 'leads'} selected
        </span>
        <button
          type="button"
          onClick={onClearSelection}
          className="ml-1 text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none"
          aria-label="Clear selection"
        >
          ×
        </button>
      </div>

      {/* Status change */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setShowStatusMenu((v) => !v); setShowTagInput(false); }}
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                     text-text-primary bg-bg-base hover:bg-bg-subtle border border-border
                     transition-colors disabled:opacity-50"
        >
          <span className="text-base">🔄</span>
          Set Status
          <span className="text-text-tertiary text-xs">▾</span>
        </button>
        {showStatusMenu && (
          <div className="absolute bottom-full mb-2 left-0 w-44 bg-bg-elevated border border-border rounded-xl shadow-xl overflow-hidden z-10">
            {ALL_LEAD_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleStatusChange(s)}
                className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-subtle transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add tags */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setShowTagInput((v) => !v); setShowStatusMenu(false); }}
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                     text-text-primary bg-bg-base hover:bg-bg-subtle border border-border
                     transition-colors disabled:opacity-50"
        >
          <span className="text-base">🏷️</span>
          Add Tags
        </button>
        {showTagInput && (
          <div className="absolute bottom-full mb-2 left-0 w-64 bg-bg-elevated border border-border rounded-xl shadow-xl p-3 z-10">
            <p className="text-xs text-text-tertiary mb-2">Comma-separated tags</p>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTags(); }}
              placeholder="urgent, vip, follow-up"
              autoFocus
              className="w-full px-3 py-1.5 rounded-lg border border-border bg-bg-base
                         text-sm text-text-primary placeholder:text-text-tertiary
                         focus:outline-none focus:border-primary-500 transition-colors"
            />
            <button
              type="button"
              onClick={handleAddTags}
              disabled={!tagInput.trim() || isPending}
              className="mt-2 w-full py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600
                         text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              Apply Tags
            </button>
          </div>
        )}
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                   text-danger-400 bg-bg-base hover:bg-danger-500/10 border border-border
                   transition-colors disabled:opacity-50"
      >
        <span className="text-base">🗑️</span>
        Delete
      </button>

      {isPending && (
        <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
      )}
    </div>
  );
}
