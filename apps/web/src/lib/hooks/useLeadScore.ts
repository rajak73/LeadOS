'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface LeadScoreData {
  score: number | null;
  aiScoreUpdatedAt: string | null;
  factors: {
    type: 'POSITIVE' | 'NEGATIVE';
    description: string;
  }[] | null;
  recommendation: string | null;
  history: Array<{
    id: string;
    score: number;
    factors: {
      type: 'POSITIVE' | 'NEGATIVE';
      description: string;
    }[];
    recommendation: string;
    createdAt: string;
  }>;
}

export function useLeadScore(leadId: string) {
  return useQuery<LeadScoreData>({
    queryKey: ['lead-score', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/bff/leads/${leadId}/score`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch lead score');
      }
      const json = await res.json();
      return json.data;
    },
    staleTime: 30_000,
    enabled: !!leadId,
  });
}

export function useRescoreLead(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/bff/leads/${leadId}/rescore`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.error?.code || 'Failed to rescore lead');
      }
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lead-score', leadId] });
      void queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
