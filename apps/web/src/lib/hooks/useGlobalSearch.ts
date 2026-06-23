'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Lead } from '@/lib/types/api';

export interface SearchResult {
  leads: Lead[];
  deals: Array<{
    id: string;
    title: string;
    value: number;
    currency: string;
    status: string;
    stageName?: string;
  }>;
  conversations: Array<{
    id: string;
    igConversationId: string;
    status: string;
    lastMessageAt: string;
  }>;
}

export function useGlobalSearch(query: string) {
  return useQuery<SearchResult>({
    queryKey: ['search', query],
    queryFn: async () => {
      if (!query.trim()) return { leads: [], deals: [], conversations: [] };
      const res = await apiClient.get<{ data: SearchResult }>('/search', {
        params: { q: query },
      });
      return res.data.data;
    },
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
  });
}
