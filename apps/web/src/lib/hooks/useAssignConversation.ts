'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Conversation, ConversationStatus } from '@/lib/types/api';

interface AssignConversationInput {
  conversationId: string;
  assignedToId?: string | null;
  status?: ConversationStatus;
}

export function useAssignConversation() {
  const queryClient = useQueryClient();

  return useMutation<Conversation, Error, AssignConversationInput>({
    mutationFn: async ({ conversationId, assignedToId, status }) => {
      const body: Record<string, unknown> = {};
      if (assignedToId !== undefined) body.assignedToId = assignedToId;
      if (status !== undefined) body.status = status;

      const res = await fetch(`/api/bff/inbox/conversations/${conversationId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { data?: Conversation; error?: { code?: string } };
      if (!res.ok) throw new Error(json.error?.code ?? 'UPDATE_ERROR');
      return json.data!;
    },
    onSuccess: (_data, { conversationId }) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });
}
