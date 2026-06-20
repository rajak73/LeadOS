'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Lead, LeadListQuery, PaginationMeta } from '@/lib/types/api';

export interface LeadsPage {
  data: Lead[];
  meta: PaginationMeta;
}

export function useLeads(filters: LeadListQuery = {}) {
  const { page = 1, limit = 25, ...rest } = filters;

  return useQuery<LeadsPage>({
    queryKey: ['leads', filters],
    queryFn: async () => {
      const params: Record<string, unknown> = { page, limit, ...rest };
      // Array params need to be serialised as repeated keys for the API.
      if (Array.isArray(rest.status) && rest.status.length > 0)
        params.status = rest.status;
      if (Array.isArray(rest.source) && rest.source.length > 0)
        params.source = rest.source;
      if (Array.isArray(rest.tags) && rest.tags.length > 0)
        params.tags = rest.tags;
      const res = await apiClient.get<LeadsPage>('/leads', { params });
      return res.data;
    },
    staleTime: 30_000,
  });
}
