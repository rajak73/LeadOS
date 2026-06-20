'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Deal } from '@/lib/types/api';

interface MoveDealVars {
  dealId: string;
  stageId: string;
  pipelineId: string;
}

export function useMoveDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ dealId, stageId }: MoveDealVars) =>
      apiClient.post(`/deals/${dealId}/move`, { stageId }),

    onMutate: async ({ dealId, stageId, pipelineId }) => {
      await queryClient.cancelQueries({ queryKey: ['deals', pipelineId] });
      const previousDeals = queryClient.getQueryData<Deal[]>(['deals', pipelineId]);
      queryClient.setQueryData<Deal[]>(['deals', pipelineId], (old = []) =>
        old.map((d) => (d.id === dealId ? { ...d, stageId } : d)),
      );
      return { previousDeals, pipelineId };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousDeals && context.pipelineId) {
        queryClient.setQueryData(['deals', context.pipelineId], context.previousDeals);
      }
    },

    onSettled: (_data, _err, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['deals', vars.pipelineId] });
      void queryClient.invalidateQueries({ queryKey: ['forecast', vars.pipelineId] });
    },
  });
}
