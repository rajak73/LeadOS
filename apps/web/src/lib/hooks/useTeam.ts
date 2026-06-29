import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api-client';

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const res = await apiClient.post('/team/invite', data);
      return res.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { userId: string; roleName: string }) => {
      const res = await apiClient.put(`/team/${data.userId}/role`, { roleName: data.roleName });
      return res.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiClient.delete(`/team/${userId}`);
      return res.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    },
  });
}
