'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { ConversationPage, ConversationStatus } from '@/lib/types/api';

export interface ConversationFilters {
  accountId?: string;
  assignedToId?: string;
  status?: ConversationStatus;
  mine?: boolean; // "Mine" tab — server interprets as assignedToId = current user
}

async function fetchConversationsPage(
  filters: ConversationFilters,
  cursor: string | null,
): Promise<ConversationPage> {
  const params = new URLSearchParams();
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.assignedToId) params.set('assignedToId', filters.assignedToId);
  if (filters.status) params.set('status', filters.status);
  if (cursor) params.set('cursor', cursor);

  const qs = params.toString();
  const res = await fetch(`/api/bff/inbox/conversations${qs ? `?${qs}` : ''}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  const json = (await res.json()) as { data?: ConversationPage; success?: boolean };
  if (!res.ok) throw new Error((json as { error?: { code?: string } }).error?.code ?? 'FETCH_ERROR');
  return json.data!;
}

export function useConversations(filters: ConversationFilters = {}) {
  return useInfiniteQuery({
    queryKey: ['conversations', filters] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchConversationsPage(filters, pageParam),
    getNextPageParam: (lastPage: ConversationPage) => lastPage.nextCursor ?? null,
    staleTime: 30_000,
  });
}
