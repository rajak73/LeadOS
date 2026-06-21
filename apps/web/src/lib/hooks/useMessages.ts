'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { MessagePage } from '@/lib/types/api';

async function fetchMessagesPage(
  conversationId: string,
  cursor: string | null,
): Promise<MessagePage> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  const res = await fetch(
    `/api/bff/inbox/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`,
    { credentials: 'include', cache: 'no-store' },
  );
  const json = (await res.json()) as { data?: MessagePage; success?: boolean };
  if (!res.ok) throw new Error((json as { error?: { code?: string } }).error?.code ?? 'FETCH_ERROR');
  return json.data!;
}

export function useMessages(conversationId: string | null) {
  return useInfiniteQuery({
    queryKey: ['messages', conversationId] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchMessagesPage(conversationId!, pageParam),
    getNextPageParam: (lastPage: MessagePage) => lastPage.nextCursor ?? null,
    enabled: !!conversationId,
    staleTime: 10_000,
  });
}
