'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  channel: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListData {
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
}

async function fetchNotifications(unreadOnly: boolean): Promise<NotificationListData> {
  const qs = unreadOnly ? '?unread=true' : '';
  const res = await fetch(`/api/bff/notifications${qs}`, { credentials: 'include', cache: 'no-store' });
  const json = (await res.json()) as { data?: NotificationListData };
  if (!res.ok) throw new Error('FETCH_ERROR');
  return json.data ?? { items: [], nextCursor: null, unreadCount: 0 };
}

export function useNotifications(unreadOnly = false) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', { unreadOnly }] as const,
    queryFn: () => fetchNotifications(unreadOnly),
    staleTime: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/bff/notifications/${id}/read`, { method: 'POST', credentials: 'include' });
    },
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch('/api/bff/notifications/read', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    },
    onSuccess: invalidate,
  });

  return {
    notifications: query.data?.items ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    isLoading: query.isLoading,
    refetch: invalidate,
    markRead: (id: string) => markRead.mutate(id),
    markAllRead: () => markAllRead.mutate(),
  };
}
