'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Deal } from '@/lib/types/api';

export function useDealDetail(id: string, initialData?: Deal) {
  const base = {
    queryKey: ['deal', id] as const,
    queryFn: async () => {
      const res = await apiClient.get<{ data: Deal }>(`/deals/${id}`);
      return res.data.data;
    },
    staleTime: 30_000,
  };
  return useQuery<Deal>(
    initialData !== undefined ? { ...base, initialData } : base,
  );
}
