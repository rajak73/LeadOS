'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ForecastRow } from '@/lib/types/api';

export function useForecast(pipelineId: string | null) {
  return useQuery<ForecastRow[]>({
    queryKey: ['forecast', pipelineId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ForecastRow[] }>('/deals/forecast', {
        params: pipelineId ? { pipelineId } : {},
      });
      return res.data.data;
    },
    enabled: !!pipelineId,
    staleTime: 60_000,
  });
}
