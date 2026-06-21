// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useConversations } from './useConversations';
import { makeConversation } from '@/test-utils';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useConversations', () => {
  it('fetches conversations and returns items', async () => {
    const conv = makeConversation();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { items: [conv], nextCursor: null } }),
    });

    const { result } = renderHook(() => useConversations(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const items = result.current.data?.pages.flatMap((p) => p.items) ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('conv-1');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { code: 'UNAUTHORIZED' } }),
    });

    const { result } = renderHook(() => useConversations(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('UNAUTHORIZED');
  });

  it('applies assignedToId filter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { items: [], nextCursor: null } }),
    });

    renderHook(() => useConversations({ assignedToId: 'user-99' }), { wrapper });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const url = mockFetch.mock.calls[0]?.[0] as string;
    expect(url).toContain('assignedToId=user-99');
  });
});
