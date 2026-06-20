'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { InstagramAccount } from '@/lib/types/api';

const QUERY_KEY = ['instagram', 'accounts'];

export function useInstagramAccounts() {
  return useQuery<InstagramAccount[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await apiClient.get<{ data: InstagramAccount[] }>('/instagram/accounts');
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useDisconnectInstagramAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/instagram/accounts/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useConnectInstagram() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.get<{ data: { redirectUrl: string } }>('/instagram/auth');
      return res.data.data.redirectUrl;
    },
    onSuccess: (redirectUrl) => {
      window.location.href = redirectUrl;
    },
  });
}
