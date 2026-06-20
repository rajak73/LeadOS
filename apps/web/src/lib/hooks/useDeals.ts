'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Deal } from '@/lib/types/api';

export function useDeals(pipelineId: string | null) {
  return useQuery<Deal[]>({
    queryKey: ['deals', pipelineId],
    queryFn: async () => {
      if (!pipelineId) return [];
      const res = await apiClient.get<{ data: Deal[] }>('/deals', {
        params: { pipelineId, status: 'OPEN', limit: 50 },
      });
      return res.data.data;
    },
    enabled: !!pipelineId,
    staleTime: 30_000,
  });
}
