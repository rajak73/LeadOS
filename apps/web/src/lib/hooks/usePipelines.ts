'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Pipeline } from '@/lib/types/api';

export function usePipelines() {
  return useQuery<Pipeline[]>({
    queryKey: ['pipelines'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Pipeline[] }>('/pipelines');
      return res.data.data;
    },
    staleTime: 60_000,
  });
}
