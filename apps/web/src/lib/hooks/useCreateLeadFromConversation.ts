'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Lead } from '@/lib/types/api';

interface CreateLeadInput {
  conversationId: string;
  firstName: string;
  lastName?: string;
}

export function useCreateLeadFromConversation() {
  const queryClient = useQueryClient();
  return useMutation<Lead, Error, CreateLeadInput>({
    mutationFn: async ({ conversationId, ...body }) => {
      const res = await fetch(`/api/bff/inbox/conversations/${conversationId}/leads`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { data?: Lead; error?: { code?: string } };
      if (!res.ok) throw new Error(json.error?.code ?? 'CREATE_LEAD_ERROR');
      return json.data!;
    },
    onSuccess: () => {
      // Invalidate conversations so the linked lead appears immediately
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
