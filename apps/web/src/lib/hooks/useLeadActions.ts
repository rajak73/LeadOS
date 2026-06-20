'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Lead } from '@/lib/types/api';

export function usePatchLead(leadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient.patch<{ data: Lead }>(`/leads/${leadId}`, body),
    onSuccess: (res) => {
      queryClient.setQueryData(['lead', leadId], res.data.data);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (leadId: string) => apiClient.delete(`/leads/${leadId}`),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useConvertLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (leadId: string) =>
      apiClient.post<{ data: { lead: Lead; contact: unknown } }>(`/leads/${leadId}/convert`),
    onSuccess: (_res, leadId) => {
      void queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiClient.post<{ data: Lead }>('/leads', body),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
