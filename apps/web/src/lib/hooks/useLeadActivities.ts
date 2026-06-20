'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ActivityItem, PaginationMeta } from '@/lib/types/api';

interface ActivityPage {
  data: ActivityItem[];
  meta: PaginationMeta;
}

export function useLeadActivities(leadId: string) {
  return useInfiniteQuery<ActivityPage>({
    queryKey: ['lead-activities', leadId],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.get<ActivityPage>(`/leads/${leadId}/activities`, {
        params: { page: pageParam, limit: 20 },
      });
      return res.data;
    },
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
    staleTime: 60_000,
  });
}
