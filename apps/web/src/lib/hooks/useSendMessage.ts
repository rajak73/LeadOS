'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Message, MessagePage } from '@/lib/types/api';

interface SendMessageInput {
  conversationId: string;
  text: string;
}

interface SendMessageResult {
  messageId: string;
  status: 'SENT';
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation<SendMessageResult, Error, SendMessageInput, { previousMessages: MessagePage | undefined }>({
    mutationFn: async ({ conversationId, text }) => {
      const res = await fetch(`/api/bff/inbox/conversations/${conversationId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { text } }),
      });
      const json = (await res.json()) as { data?: SendMessageResult; error?: { code?: string } };
      if (!res.ok) throw new Error(json.error?.code ?? 'SEND_ERROR');
      return json.data!;
    },
    onMutate: async ({ conversationId, text }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });
      const previousMessages = queryClient.getQueryData<MessagePage>(['messages', conversationId]);

      // Optimistic insert — temporary message with SENT status
      const optimistic: Message = {
        id: `optimistic-${Date.now()}`,
        organizationId: '',
        conversationId,
        mid: `local-${Date.now()}`,
        direction: 'OUTBOUND',
        contentType: 'TEXT',
        content: { text },
        status: 'SENT',
        sentAt: new Date().toISOString(),
        deliveredAt: null,
        readAt: null,
        senderId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<MessagePage>(['messages', conversationId], (old) => {
        if (!old) return { items: [optimistic], nextCursor: null };
        return { ...old, items: [optimistic, ...old.items] };
      });

      return { previousMessages };
    },
    onError: (_err, { conversationId }, context) => {
      // Roll back optimistic update
      if (context?.previousMessages !== undefined) {
        queryClient.setQueryData(['messages', conversationId], context.previousMessages);
      }
    },
    onSuccess: (_data, { conversationId }) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });
}
