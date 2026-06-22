'use client';

import { useEffect, useRef, useState } from 'react';
import { useLeadsStore } from '@/lib/store/leads-store';
import { ALL_LEAD_STATUSES, ALL_LEAD_SOURCES, formatLeadStatus, formatLeadSource } from '@/lib/types/api';
import type { LeadStatus, LeadSource } from '@/lib/types/api';
import { Button } from '@/components/ui/Button';

export function LeadFilters() {
  const { filters, setFilters, savedPresets, savePreset, loadPreset, deletePreset, resetFilters } =
    useLeadsStore();

  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const [presetName, setPresetName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external filter.search back to local input (e.g. on reset).
  useEffect(() => {
    setSearchInput(filters.search ?? '');
  }, [filters.search]);

  // Debounced search — 300 ms.
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters({ search: value || undefined });
    }, 300);
  };

  const toggleStatus = (s: LeadStatus) => {
    const current = filters.status ?? [];
    const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
    setFilters({ status: next.length ? next : undefined });
  };

  const toggleSource = (s: LeadSource) => {
    const current = filters.source ?? [];
    const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
    setFilters({ source: next.length ? next : undefined });
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    savePreset(presetName.trim());
    setPresetName('');
  };

  // Count active advanced filters for the badge
  const advancedCount = [
    (filters.source ?? []).length > 0,
    filters.aiScoreMin !== undefined,
    filters.aiScoreMax !== undefined,
    filters.createdFrom !== undefined,
    filters.createdTo !== undefined,
    (filters.tags ?? []).length > 0,
    filters.assignedToId !== undefined,
  ].filter(Boolean).length;

  return (
    <div className="space-y-3 p-4 bg-bg-elevated border border-border rounded-xl" data-testid="lead-filters">
      {/* Row 1: search + status + filter toggle */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <input
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search leads…"
          className="flex-1 min-w-[160px] px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors"
          data-testid="search-input"
        />

        {/* Status chips — always visible */}
        <div className="flex flex-wrap gap-1">
          {ALL_LEAD_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              data-testid={`filter-status-${s}`}
              className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                (filters.status ?? []).includes(s)
                  ? 'bg-primary-500/20 border-primary-500/50 text-primary-400'
                  : 'bg-bg-base border-border text-text-secondary hover:border-border-strong hover:text-text-primary'
              }`}
            >
              {formatLeadStatus(s)}
            </button>
          ))}
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
            showAdvanced || advancedCount > 0
              ? 'bg-primary-500/10 border-primary-500/40 text-primary-400'
              : 'bg-bg-base border-border text-text-secondary hover:text-text-primary hover:border-border-strong'
          }`}
        >
          {showAdvanced ? '▴' : '▾'} Filters
          {advancedCount > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary-500/20 text-primary-400 text-[10px] font-semibold">
              {advancedCount}
            </span>
          )}
        </button>
      </div>

      {/* Advanced section — CSS hidden so testids remain in DOM for existing tests */}
      <div className={showAdvanced ? 'space-y-3' : 'hidden'}>
        {/* Source filter */}
        <div>
          <label className="text-xs text-text-tertiary block mb-1.5">Source</label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_LEAD_SOURCES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleSource(s)}
                data-testid={`filter-source-${s}`}
                className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                  (filters.source ?? []).includes(s)
                    ? 'bg-primary-500/20 border-primary-500/50 text-primary-400'
                    : 'bg-bg-base border-border text-text-secondary hover:border-border-strong hover:text-text-primary'
                }`}
              >
                {formatLeadSource(s)}
              </button>
            ))}
          </div>
        </div>

        {/* AI score range */}
        <div className="flex gap-3">
          <div>
            <label className="text-xs text-text-tertiary block mb-1">AI Score min</label>
            <input
              type="number"
              min={0}
              max={100}
              value={filters.aiScoreMin ?? ''}
              onChange={(e) => setFilters({ aiScoreMin: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="0"
              data-testid="filter-ai-score-min"
              className="w-20 px-2 py-1 text-sm bg-bg-base border border-border rounded text-text-primary focus:outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="text-xs text-text-tertiary block mb-1">AI Score max</label>
            <input
              type="number"
              min={0}
              max={100}
              value={filters.aiScoreMax ?? ''}
              onChange={(e) => setFilters({ aiScoreMax: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="100"
              data-testid="filter-ai-score-max"
              className="w-20 px-2 py-1 text-sm bg-bg-base border border-border rounded text-text-primary focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>

        {/* Date range */}
        <div className="flex gap-3 flex-wrap">
          <div>
            <label className="text-xs text-text-tertiary block mb-1">Created from</label>
            <input
              type="date"
              value={filters.createdFrom ?? ''}
              onChange={(e) => setFilters({ createdFrom: e.target.value || undefined })}
              placeholder="YYYY-MM-DD"
              data-testid="filter-created-from"
              className="text-sm bg-bg-base border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="text-xs text-text-tertiary block mb-1">Created to</label>
            <input
              type="date"
              value={filters.createdTo ?? ''}
              onChange={(e) => setFilters({ createdTo: e.target.value || undefined })}
              placeholder="YYYY-MM-DD"
              data-testid="filter-created-to"
              className="text-sm bg-bg-base border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="text-xs text-text-tertiary block mb-1">Tags</label>
          <input
            value={(filters.tags ?? []).join(', ')}
            onChange={(e) => {
              const arr = e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
              setFilters({ tags: arr.length ? arr : undefined });
            }}
            placeholder="instagram, hot-lead, q2"
            data-testid="filter-tags"
            className="w-full px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors"
          />
        </div>

        {/* Assigned to */}
        <div>
          <label className="text-xs text-text-tertiary block mb-1">Assigned to</label>
          <input
            value={filters.assignedToId ?? ''}
            onChange={(e) => setFilters({ assignedToId: e.target.value || undefined })}
            placeholder="Search by email or user ID"
            data-testid="filter-assignedToId"
            className="w-full px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/50">
          <Button variant="secondary" onClick={resetFilters} data-testid="btn-reset-filters">
            Reset
          </Button>
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Preset name"
            className="flex-1 px-2 py-1 text-xs bg-bg-base border border-border rounded text-text-primary focus:outline-none focus:border-primary-500"
            data-testid="preset-name-input"
          />
          <Button variant="secondary" onClick={handleSavePreset} data-testid="btn-save-preset">
            Save
          </Button>
        </div>

        {/* Saved presets */}
        {savedPresets.length > 0 && (
          <div>
            <label className="text-xs text-text-tertiary block mb-1.5">Saved presets</label>
            <div className="flex flex-wrap gap-1.5">
              {savedPresets.map((p) => (
                <div key={p.name} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => loadPreset(p.name)}
                    data-testid={`preset-${p.name}`}
                    className="px-2 py-0.5 rounded text-xs border border-border bg-bg-base text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePreset(p.name)}
                    aria-label={`Delete preset ${p.name}`}
                    className="text-text-tertiary hover:text-red-400 text-xs transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
