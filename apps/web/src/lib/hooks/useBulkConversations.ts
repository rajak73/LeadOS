'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type BulkConversationAction =
  | { action: 'assign'; ids: string[]; assignedToId: string | null }
  | { action: 'close'; ids: string[] }
  | { action: 'reopen'; ids: string[] }
  | { action: 'add-labels'; ids: string[]; labels: string[] }
  | { action: 'remove-labels'; ids: string[]; labels: string[] };

export function useBulkConversations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: BulkConversationAction) =>
      apiClient.post('/inbox/conversations/bulk', body),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
