'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { LeadFile, PaginationMeta } from '@/lib/types/api';

interface FilesPage {
  data: LeadFile[];
  meta: PaginationMeta;
}

export function useLeadFiles(leadId: string) {
  return useQuery<FilesPage>({
    queryKey: ['lead-files', leadId],
    queryFn: async () => {
      const res = await apiClient.get<FilesPage>(`/leads/${leadId}/files`, {
        params: { page: 1, limit: 50 },
      });
      return res.data;
    },
    staleTime: 60_000,
  });
}
