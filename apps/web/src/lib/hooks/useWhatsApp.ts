'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WhatsAppAccountStatus = 'ACTIVE' | 'DISCONNECTED' | 'EXPIRED';
export type WhatsAppTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type WhatsAppTemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED';

export interface WhatsAppAccount {
  id: string;
  organizationId: string;
  wabaId: string;
  phoneNumberId: string;
  displayName: string;
  phoneNumber: string;
  status: WhatsAppAccountStatus;
  webhookVerified: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // accessToken is never returned by the API
}

export interface WhatsAppTemplate {
  id: string;
  organizationId: string;
  accountId: string;
  templateId: string;
  name: string;
  language: string;
  category: WhatsAppTemplateCategory;
  status: WhatsAppTemplateStatus;
  components: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectWhatsAppAccountInput {
  wabaId: string;
  phoneNumberId: string;
  displayName: string;
  phoneNumber: string;
  accessToken: string;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

const ACCOUNTS_KEY = ['whatsapp', 'accounts'] as const;
const templatesKey = (accountId: string) => ['whatsapp', 'templates', accountId] as const;

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Fetch all connected WhatsApp Business accounts for the org. */
export function useWhatsAppAccounts() {
  return useQuery<WhatsAppAccount[]>({
    queryKey: ACCOUNTS_KEY,
    queryFn: async () => {
      const res = await apiClient.get<{ data: WhatsAppAccount[] }>('/whatsapp/accounts');
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

/** Connect (POST) a new WABA account. */
export function useConnectWhatsAppAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConnectWhatsAppAccountInput) => {
      const res = await apiClient.post<{ data: WhatsAppAccount }>('/whatsapp/accounts', input);
      return res.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    },
  });
}

/** Disconnect (soft-delete) a WABA account. */
export function useDisconnectWhatsAppAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/whatsapp/accounts/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    },
  });
}

/** Fetch approved templates cached for an account. */
export function useWhatsAppTemplates(accountId: string | null) {
  return useQuery<WhatsAppTemplate[]>({
    queryKey: templatesKey(accountId ?? ''),
    queryFn: async () => {
      if (!accountId) return [];
      const res = await apiClient.get<{ data: WhatsAppTemplate[] }>(
        `/whatsapp/accounts/${accountId}/templates`,
      );
      return res.data.data;
    },
    enabled: !!accountId,
    staleTime: 60_000,
  });
}

/** Trigger a template sync from Meta for an account. */
export function useSyncWhatsAppTemplates(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: { synced: number } }>(
        `/whatsapp/accounts/${accountId}/sync-templates`,
      );
      return res.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: templatesKey(accountId) });
    },
  });
}
