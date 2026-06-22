import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationBell } from './NotificationBell';
import { renderWithProviders } from '@/test-utils';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@/lib/socket/client', () => ({ useSocketEvent: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

function listResponse(unreadCount: number) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data: {
        items: [
          {
            id: 'n1',
            type: 'INBOX_MESSAGE',
            title: 'New message from Alice',
            body: 'Hello there',
            entityType: 'conversation',
            entityId: 'c1',
            channel: 'IN_APP',
            readAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
        unreadCount,
      },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/bff/notifications/read')) return Promise.resolve({ ok: true, json: async () => ({}) });
    if (url.includes('/api/bff/notifications')) return Promise.resolve(listResponse(3));
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
});

describe('NotificationBell', () => {
  it('renders the unread count badge from the API', async () => {
    renderWithProviders(<NotificationBell />);
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
  });

  it('opens the panel and lists notifications', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await waitFor(() => expect(screen.getByText('New message from Alice')).toBeInTheDocument());
  });

  it('marks all read via the BFF', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await waitFor(() => expect(screen.getByText('Mark all read')).toBeInTheDocument());
    await user.click(screen.getByText('Mark all read'));

    await waitFor(() =>
      expect(mockFetch.mock.calls.some((c) => (c[0] as string).includes('/api/bff/notifications/read'))).toBe(true),
    );
  });
});
