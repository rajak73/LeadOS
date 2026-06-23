'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type BulkLeadAction =
  | { action: 'update-status'; ids: string[]; status: string }
  | { action: 'assign'; ids: string[]; assignedToId: string | null }
  | { action: 'add-tags'; ids: string[]; tags: string[] }
  | { action: 'remove-tags'; ids: string[]; tags: string[] }
  | { action: 'delete'; ids: string[] };

export function useBulkLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: BulkLeadAction) => apiClient.post('/leads/bulk', body),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
