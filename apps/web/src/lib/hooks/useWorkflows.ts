'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { WorkflowDefinition } from '@leados/shared';

export interface Workflow {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  triggerType: string;
  definition: WorkflowDefinition;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowActionLog {
  success: boolean;
  action: string;
  error?: string | null;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  triggerEvent: unknown;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  error: string | null;
  depth: number;
  actionLogs: WorkflowActionLog[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowMeta {
  triggers: string[];
  fields: string[];
  operators: string[];
  actions: { type: string; label: string }[];
}

export function useWorkflows() {
  return useQuery<Workflow[]>({
    queryKey: ['workflows'],
    queryFn: async () => {
      const res = await fetch('/api/bff/workflows', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch workflows');
      }
      const json = await res.json();
      return json.data;
    },
    staleTime: 10_000,
  });
}

export function useWorkflow(id: string) {
  return useQuery<Workflow>({
    queryKey: ['workflow', id],
    queryFn: async () => {
      const res = await fetch(`/api/bff/workflows/${id}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch workflow ${id}`);
      }
      const json = await res.json();
      return json.data;
    },
    enabled: !!id && id !== 'new',
    staleTime: 10_000,
  });
}

export function useWorkflowMeta() {
  return useQuery<WorkflowMeta>({
    queryKey: ['workflows-meta'],
    queryFn: async () => {
      const res = await fetch('/api/bff/workflows/meta', {
        credentials: 'include',
        cache: 'force-cache',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch workflows metadata');
      }
      const json = await res.json();
      return json.data;
    },
    staleTime: 3600_000,
  });
}

export function useWorkflowRuns(workflowId: string) {
  return useQuery<WorkflowRun[]>({
    queryKey: ['workflow-runs', workflowId],
    queryFn: async () => {
      const res = await fetch(`/api/bff/workflows/${workflowId}/runs`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch runs for workflow ${workflowId}`);
      }
      const json = await res.json();
      return json.data;
    },
    enabled: !!workflowId,
    staleTime: 5_000,
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<Workflow, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>) => {
      const res = await fetch('/api/bff/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to create workflow');
      }
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

export function useUpdateWorkflow(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Omit<Workflow, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>>) => {
      const res = await fetch(`/api/bff/workflows/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to update workflow');
      }
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflows'] });
      void queryClient.invalidateQueries({ queryKey: ['workflow', id] });
    },
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/bff/workflows/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to delete workflow');
      }
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}
