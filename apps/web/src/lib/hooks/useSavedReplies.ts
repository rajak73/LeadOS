'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SavedReply } from '@/lib/types/api';

const QUERY_KEY = ['saved-replies'] as const;

async function fetchSavedReplies(): Promise<SavedReply[]> {
  const res = await fetch('/api/bff/inbox/saved-replies', { credentials: 'include' });
  const json = (await res.json()) as { data?: { items?: SavedReply[] }; error?: { code?: string } };
  if (!res.ok) throw new Error(json.error?.code ?? 'FETCH_ERROR');
  return json.data?.items ?? [];
}

export function useSavedReplies() {
  return useQuery<SavedReply[], Error>({
    queryKey: QUERY_KEY,
    queryFn: fetchSavedReplies,
    staleTime: 60_000, // replies change infrequently
  });
}

interface CreateSavedReplyInput {
  title: string;
  content: string;
  shortcut?: string;
  isGlobal?: boolean;
}

export function useCreateSavedReply() {
  const queryClient = useQueryClient();
  return useMutation<SavedReply, Error, CreateSavedReplyInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/bff/inbox/saved-replies', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as { data?: SavedReply; error?: { code?: string } };
      if (!res.ok) throw new Error(json.error?.code ?? 'CREATE_ERROR');
      return json.data!;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

interface UpdateSavedReplyInput {
  id: string;
  title?: string;
  content?: string;
  shortcut?: string | null;
  isGlobal?: boolean;
}

export function useUpdateSavedReply() {
  const queryClient = useQueryClient();
  return useMutation<SavedReply, Error, UpdateSavedReplyInput>({
    mutationFn: async ({ id, ...patch }) => {
      const res = await fetch(`/api/bff/inbox/saved-replies/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as { data?: SavedReply; error?: { code?: string } };
      if (!res.ok) throw new Error(json.error?.code ?? 'UPDATE_ERROR');
      return json.data!;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useDeleteSavedReply() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/bff/inbox/saved-replies/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
        throw new Error(json.error?.code ?? 'DELETE_ERROR');
      }
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}
