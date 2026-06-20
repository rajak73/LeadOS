'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LeadListQuery } from '@/lib/types/api';

export interface FilterPreset {
  name: string;
  filters: LeadListQuery;
}

const DEFAULT_FILTERS: LeadListQuery = {
  sortBy: 'createdAt',
  sortOrder: 'desc',
  page: 1,
  limit: 25,
};

// Allows undefined values so callers can clear individual fields (e.g. setFilters({ search: undefined })).
type FilterPatch = { [K in keyof LeadListQuery]?: LeadListQuery[K] | undefined };

interface LeadsStore {
  filters: LeadListQuery;
  savedPresets: FilterPreset[];

  setFilters: (patch: FilterPatch) => void;
  resetFilters: () => void;
  savePreset: (name: string) => void;
  loadPreset: (name: string) => void;
  deletePreset: (name: string) => void;
}

export const useLeadsStore = create<LeadsStore>()(
  persist(
    (set, get) => ({
      filters: { ...DEFAULT_FILTERS },
      savedPresets: [],

      setFilters: (patch) =>
        set((s) => {
          const next: LeadListQuery = { ...s.filters, page: 1 };
          for (const key of Object.keys(patch) as Array<keyof LeadListQuery>) {
            if (patch[key] === undefined) {
              delete next[key];
            } else {
              (next as Record<string, unknown>)[key] = patch[key];
            }
          }
          return { filters: next };
        }),

      resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

      savePreset: (name) => {
        const { filters, savedPresets } = get();
        const existing = savedPresets.filter((p) => p.name !== name);
        set({ savedPresets: [...existing, { name, filters: { ...filters } }] });
      },

      loadPreset: (name) => {
        const preset = get().savedPresets.find((p) => p.name === name);
        if (preset) set({ filters: { ...preset.filters } });
      },

      deletePreset: (name) =>
        set((s) => ({ savedPresets: s.savedPresets.filter((p) => p.name !== name) })),
    }),
    {
      name: 'leados-leads-filters',
      partialize: (s) => ({ savedPresets: s.savedPresets }),
    },
  ),
);
