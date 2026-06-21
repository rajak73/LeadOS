import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationList } from './ConversationList';
import { makeConversation, renderWithProviders } from '@/test-utils';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock socket so no real connection is attempted
vi.mock('@/lib/socket/client', () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  useSocketEvent: vi.fn(),
}));

function successResponse(items: ReturnType<typeof makeConversation>[]) {
  return {
    ok: true,
    json: async () => ({ success: true, data: { items, nextCursor: null } }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ConversationList', () => {
  it('shows spinner while loading', () => {
    mockFetch.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(
      <ConversationList filters={{}} selectedId={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('renders conversation items after load', async () => {
    const conv = makeConversation({ id: 'c1', lead: { id: 'l1', firstName: 'Bob', lastName: 'Jones', instagramHandle: null } });
    mockFetch.mockResolvedValueOnce(successResponse([conv]));

    renderWithProviders(
      <ConversationList filters={{}} selectedId={null} onSelect={vi.fn()} />,
    );

    await waitFor(() => expect(screen.getByText('Bob Jones')).toBeInTheDocument());
  });

  it('shows empty state when no conversations', async () => {
    mockFetch.mockResolvedValueOnce(successResponse([]));

    renderWithProviders(
      <ConversationList filters={{}} selectedId={null} onSelect={vi.fn()} />,
    );

    await waitFor(() => expect(screen.getByText(/no conversations/i)).toBeInTheDocument());
  });

  it('calls onSelect when item clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const conv = makeConversation();
    mockFetch.mockResolvedValueOnce(successResponse([conv]));

    renderWithProviders(
      <ConversationList filters={{}} selectedId={null} onSelect={onSelect} />,
    );

    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument());
    await user.click(screen.getByText('Alice Smith'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'conv-1' }));
  });
});
