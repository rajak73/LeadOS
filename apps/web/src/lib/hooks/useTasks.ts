'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Task {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  type: 'CALL' | 'EMAIL' | 'MEETING' | 'FOLLOW_UP' | 'DEMO' | 'OTHER';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  dueDate: string | null;
  completedAt: string | null;
  assignedToId: string | null;
  relatedLeadId: string | null;
  relatedDealId: string | null;
  relatedContactId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface FollowupSuggestion {
  channel: 'EMAIL' | 'INSTAGRAM_DM';
  draft: string;
}

export function useTasks(filters: { status?: string; type?: string } = {}) {
  const queryParams = new URLSearchParams();
  if (filters.status) queryParams.append('status', filters.status);
  if (filters.type) queryParams.append('type', filters.type);

  return useQuery<Task[]>({
    queryKey: ['tasks', filters],
    queryFn: async () => {
      const res = await fetch(`/api/bff/tasks?${queryParams.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch tasks');
      }
      const json = await res.json();
      return json.data;
    },
    staleTime: 10_000,
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Omit<Task, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>> }) => {
      const res = await fetch(`/api/bff/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to update task');
      }
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useFollowupSuggestion(leadId: string, enabled = false) {
  return useQuery<FollowupSuggestion>({
    queryKey: ['follow-up-suggestion', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/bff/leads/${leadId}/follow-up-suggestion`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch follow-up suggestion');
      }
      const json = await res.json();
      return json.data;
    },
    enabled: !!leadId && enabled,
    staleTime: 60_000,
  });
}
