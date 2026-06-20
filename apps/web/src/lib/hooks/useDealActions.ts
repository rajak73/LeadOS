'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Deal } from '@/lib/types/api';

export function useMarkWon(pipelineId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dealId: string) => apiClient.post(`/deals/${dealId}/won`),

    onMutate: async (dealId) => {
      if (!pipelineId) return;
      await queryClient.cancelQueries({ queryKey: ['deals', pipelineId] });
      const previousDeals = queryClient.getQueryData<Deal[]>(['deals', pipelineId]);
      queryClient.setQueryData<Deal[]>(['deals', pipelineId], (old = []) =>
        old.filter((d) => d.id !== dealId),
      );
      return { previousDeals };
    },

    onError: (_err, _dealId, context) => {
      if (context?.previousDeals && pipelineId) {
        queryClient.setQueryData(['deals', pipelineId], context.previousDeals);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['deals', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['forecast', pipelineId] });
    },
  });
}

export function useMarkLost(pipelineId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, reason }: { dealId: string; reason?: string }) =>
      apiClient.post(`/deals/${dealId}/lost`, { reason }),

    onMutate: async ({ dealId }) => {
      if (!pipelineId) return;
      await queryClient.cancelQueries({ queryKey: ['deals', pipelineId] });
      const previousDeals = queryClient.getQueryData<Deal[]>(['deals', pipelineId]);
      queryClient.setQueryData<Deal[]>(['deals', pipelineId], (old = []) =>
        old.filter((d) => d.id !== dealId),
      );
      return { previousDeals };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousDeals && pipelineId) {
        queryClient.setQueryData(['deals', pipelineId], context.previousDeals);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['deals', pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['forecast', pipelineId] });
    },
  });
}

export function useCreateDeal(pipelineId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiClient.post<{ data: Deal }>('/deals', body),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['deals', pipelineId] });
    },
  });
}

export function usePatchDeal(dealId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient.patch<{ data: Deal }>(`/deals/${dealId}`, body),
    onSuccess: (res) => {
      queryClient.setQueryData(['deal', dealId], res.data.data);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
    },
  });
}
