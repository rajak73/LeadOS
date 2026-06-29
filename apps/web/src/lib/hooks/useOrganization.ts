import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api-client';

export function useOrganization() {
  return useQuery({
    queryKey: ['current-organization'],
    queryFn: async () => {
      const res = await apiClient.get('/organizations');
      return res.data?.data?.organization || null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name?: string; industry?: string }) => {
      const res = await apiClient.put('/organizations', data);
      return res.data?.data?.organization;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-organization'] });
    },
  });
}

export function useDeleteOrganization() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.delete('/organizations');
      return res.data;
    },
  });
}
