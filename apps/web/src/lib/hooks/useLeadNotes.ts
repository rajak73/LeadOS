'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { LeadNote, PaginationMeta } from '@/lib/types/api';

interface NotesPage {
  data: LeadNote[];
  meta: PaginationMeta;
}

export function useLeadNotes(leadId: string) {
  return useQuery<NotesPage>({
    queryKey: ['lead-notes', leadId],
    queryFn: async () => {
      const res = await apiClient.get<NotesPage>(`/leads/${leadId}/notes`, {
        params: { page: 1, limit: 50 },
      });
      return res.data;
    },
    staleTime: 60_000,
  });
}

export function useCreateLeadNote(leadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: Record<string, unknown>) =>
      apiClient.post<{ data: LeadNote }>(`/leads/${leadId}/notes`, { content }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lead-notes', leadId] });
    },
  });
}
