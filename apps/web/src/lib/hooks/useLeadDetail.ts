'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Lead } from '@/lib/types/api';

export function useLeadDetail(id: string, initialData?: Lead) {
  const base = {
    queryKey: ['lead', id] as const,
    queryFn: async () => {
      const res = await apiClient.get<{ data: Lead }>(`/leads/${id}`);
      return res.data.data;
    },
    staleTime: 30_000,
  };
  return useQuery<Lead>(initialData !== undefined ? { ...base, initialData } : base);
}
