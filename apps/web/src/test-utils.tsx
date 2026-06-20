// Shared test utilities for React component tests.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';

// Fresh QueryClient per test — no shared cache.
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function AllProviders({ children }: { children: ReactNode }) {
  const qc = makeQueryClient();
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

export function renderWithProviders(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>): RenderResult {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Minimal Deal factory for tests.
export function makeDeal(overrides: Partial<import('@/lib/types/api').Deal> = {}): import('@/lib/types/api').Deal {
  return {
    id: 'deal-1',
    organizationId: 'org-1',
    title: 'Test Deal',
    value: null,
    currency: 'INR',
    pipelineId: 'pipe-1',
    stageId: 'stage-1',
    leadId: null,
    contactId: null,
    assignedToId: null,
    createdById: 'user-1',
    status: 'OPEN',
    closedAt: null,
    lostReason: null,
    expectedCloseDate: null,
    customFields: {},
    deletedAt: null,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

export function makeLead(overrides: Partial<import('@/lib/types/api').Lead> = {}): import('@/lib/types/api').Lead {
  return {
    id: 'lead-1',
    organizationId: 'org-1',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    phone: null,
    source: 'MANUAL',
    status: 'NEW',
    assignedToId: null,
    aiScore: null,
    aiScoreUpdatedAt: null,
    instagramHandle: null,
    instagramUserId: null,
    tags: [],
    customFields: {},
    lostReason: null,
    convertedToContactId: null,
    lastActivityAt: null,
    createdById: 'user-1',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    deletedAt: null,
    ...overrides,
  };
}

export function makePipeline(overrides: Partial<import('@/lib/types/api').Pipeline> = {}): import('@/lib/types/api').Pipeline {
  return {
    id: 'pipe-1',
    name: 'Main Pipeline',
    isDefault: true,
    stages: [
      { id: 'stage-1', pipelineId: 'pipe-1', name: 'Lead', order: 0, color: '#3B82F6', probability: 10, isWon: false, isLost: false },
      { id: 'stage-2', pipelineId: 'pipe-1', name: 'Qualified', order: 1, color: '#8B5CF6', probability: 30, isWon: false, isLost: false },
      { id: 'stage-won', pipelineId: 'pipe-1', name: 'Won', order: 2, color: '#10B981', probability: 100, isWon: true, isLost: false },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
