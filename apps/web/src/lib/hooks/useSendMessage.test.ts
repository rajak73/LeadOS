// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useSendMessage } from './useSendMessage';
import { makeMessage } from '@/test-utils';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSendMessage', () => {
  it('posts to BFF and returns send result', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { messageId: 'msg-new', status: 'SENT' } }),
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper });

    act(() => {
      result.current.mutate({ conversationId: 'conv-1', text: 'Hello' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.messageId).toBe('msg-new');
  });

  it('resolves to success after server response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { messageId: 'msg-new', status: 'SENT' } }),
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper });

    act(() => {
      result.current.mutate({ conversationId: 'conv-1', text: 'Optimistic' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.messageId).toBe('msg-new');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { code: 'WINDOW_CLOSED' } }),
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper });

    act(() => {
      result.current.mutate({ conversationId: 'conv-1', text: 'Hi' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('WINDOW_CLOSED');
  });

  it('uses correct BFF URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { messageId: 'x', status: 'SENT' } }),
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper });

    act(() => {
      result.current.mutate({ conversationId: 'conv-abc', text: 'test' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = mockFetch.mock.calls[0]?.[0] as string;
    expect(url).toBe('/api/bff/inbox/conversations/conv-abc/messages');

    // Suppress unused variable warning
    void makeMessage;
  });
});
