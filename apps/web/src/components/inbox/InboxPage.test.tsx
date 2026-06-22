import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InboxPage } from './InboxPage';
import { makeConversation, renderWithProviders } from '@/test-utils';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Inline vi.fn() inside factory — avoids hoisting issue with top-level const
vi.mock('@/lib/socket/client', () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  useSocketEvent: vi.fn(),
}));

import * as socketClient from '@/lib/socket/client';
const mockUseSocketEvent = vi.mocked(socketClient.useSocketEvent);

function successConvResponse(items: ReturnType<typeof makeConversation>[]) {
  return {
    ok: true,
    json: async () => ({ success: true, data: { items, nextCursor: null } }),
  };
}

function successRefreshResponse() {
  return {
    ok: true,
    json: async () => ({ data: { accessToken: 'token-abc' } }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/auth/refresh') return Promise.resolve(successRefreshResponse());
    return Promise.resolve(successConvResponse([]));
  });
});

describe('InboxPage', () => {
  it('renders All / Mine / Unassigned tabs', async () => {
    renderWithProviders(<InboxPage />);
    await waitFor(() => {
      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('Mine')).toBeInTheDocument();
      expect(screen.getByText('Unassigned')).toBeInTheDocument();
    });
  });

  it('shows empty state placeholder when no conversation is selected', async () => {
    renderWithProviders(<InboxPage />);
    await waitFor(() => expect(screen.getByText(/select a conversation/i)).toBeInTheDocument());
  });

  it('switches to Mine tab and fetches with filter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InboxPage currentUserId="user-1" />);

    await waitFor(() => expect(screen.getByText('Mine')).toBeInTheDocument());
    await user.click(screen.getByText('Mine'));

    await waitFor(() => {
      const calls = mockFetch.mock.calls.filter(
        (c) => (c[0] as string).includes('conversations'),
      );
      expect(calls.some((c) => (c[0] as string).includes('assignedToId=user-1'))).toBe(true);
    });
  });

  it('renders ThreadView when conversation is selected', async () => {
    const user = userEvent.setup();
    const conv = makeConversation();
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/auth/refresh') return Promise.resolve(successRefreshResponse());
      if ((url as string).includes('/messages')) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { items: [], nextCursor: null } }) });
      }
      return Promise.resolve(successConvResponse([conv]));
    });

    renderWithProviders(<InboxPage />);
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument());
    await user.click(screen.getByText('Alice Smith'));

    // ConversationHeader renders inside ThreadView — name appears twice
    await waitFor(() => expect(screen.getAllByText('Alice Smith').length).toBeGreaterThan(1));
  });

  // Socket lifecycle (connect on mount, disconnect on unmount, reconnect on drop) moved to
  // the dashboard chrome in Sprint 7 M1 (R-RT-1); see AppChrome.test.tsx. InboxPage now only
  // subscribes to 'inbox:message' on the shared socket — exercised by the realtime test below.
  it('invalidates conversation queries on an inbox:message socket event (R-RT-1 regression)', async () => {
    const handlers: Record<string, (data: unknown) => void> = {};
    mockUseSocketEvent.mockImplementation((event: string, handler: (data: unknown) => void) => {
      handlers[event] = handler;
    });

    renderWithProviders(<InboxPage />);
    await waitFor(() => expect(screen.getByText('All')).toBeInTheDocument());

    // The inbox must register an 'inbox:message' listener on the shared socket.
    expect(handlers['inbox:message']).toBeTypeOf('function');
    // Firing it must not throw (it invalidates the conversations / messages queries).
    expect(() => handlers['inbox:message']?.({ conversationId: 'c1', message: {} })).not.toThrow();
  });
});
