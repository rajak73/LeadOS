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
const mockConnectSocket = vi.mocked(socketClient.connectSocket);
const mockDisconnectSocket = vi.mocked(socketClient.disconnectSocket);

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

  it('bootstraps socket on mount with fresh access token', async () => {
    renderWithProviders(<InboxPage />);
    await waitFor(() => expect(mockConnectSocket).toHaveBeenCalledWith('token-abc'));
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

  // Suppress unused variable warnings for mocks only used for side-effect verification
  it('disconnects socket on unmount', () => {
    const { unmount } = renderWithProviders(<InboxPage />);
    unmount();
    expect(mockDisconnectSocket).toHaveBeenCalled();
  });
});
