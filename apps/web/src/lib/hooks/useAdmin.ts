import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api-client';

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  status: string;
  industry: string | null;
  createdAt: string;
  _count?: {
    users?: number;
    leads?: number;
  };
}

interface PaginatedResponse<T> {
  data: {
    items: T[];
    total: number;
    page: number;
    limit: number;
  }
}

export function useAdminOrganizations(page = 1, limit = 50, search = '') {
  return useQuery({
    queryKey: ['admin-organizations', page, limit, search],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<AdminOrganization>>('/admin/organizations', {
        params: { page, limit, search }
      });
      return res.data?.data;
    },
  });
}

export function useSuspendOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.put(`/admin/organizations/${id}/suspend`);
      return res.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
    },
  });
}

export function useDeleteAdminOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(`/admin/organizations/${id}`);
      return res.data?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
    },
  });
}
