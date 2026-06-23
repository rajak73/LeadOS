'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type BulkDealAction =
  | { action: 'update-stage'; ids: string[]; stageId: string }
  | { action: 'assign'; ids: string[]; assignedToId: string | null }
  | { action: 'delete'; ids: string[] };

export function useBulkDeals() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: BulkDealAction) => apiClient.post('/deals/bulk', body),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['deals'] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    },
  });
}
