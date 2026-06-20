'use client';

import { useQuery } from '@tanstack/react-query';
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
