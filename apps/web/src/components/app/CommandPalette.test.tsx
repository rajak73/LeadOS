import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from './CommandPalette';
import { renderWithProviders } from '@/test-utils';
import { useGlobalSearch } from '@/lib/hooks/useGlobalSearch';

vi.mock('@/lib/hooks/useGlobalSearch', () => ({
  useGlobalSearch: vi.fn(),
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockReset();
    vi.mocked(useGlobalSearch).mockReturnValue({
      data: { leads: [], deals: [], conversations: [] },
      isLoading: false,
    } as unknown as ReturnType<typeof useGlobalSearch>);
  });

  it('does not render when open is false', () => {
    const { container } = renderWithProviders(<CommandPalette open={false} onClose={() => {}} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders input and default state prompt when query is empty', () => {
    renderWithProviders(<CommandPalette open={true} onClose={() => {}} />);
    expect(screen.getByPlaceholderText(/Search leads, deals, conversations/i)).toBeInTheDocument();
    expect(screen.getByText(/Type to search across all records/i)).toBeInTheDocument();
  });

  it('shows loading state when query is input', async () => {
    vi.mocked(useGlobalSearch).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useGlobalSearch>);

    const user = userEvent.setup();
    renderWithProviders(<CommandPalette open={true} onClose={() => {}} />);

    const input = screen.getByPlaceholderText(/Search leads, deals, conversations/i);
    await user.type(input, 'test');

    expect(screen.getByPlaceholderText(/Search leads, deals, conversations/i)).toHaveValue('test');
  });

  it('displays search results grouped by category', async () => {
    vi.mocked(useGlobalSearch).mockReturnValue({
      data: {
        leads: [
          { id: 'l1', firstName: 'John', lastName: 'Doe', email: 'john@example.com', phone: '123' },
        ],
        deals: [
          { id: 'd1', title: 'Big Deal', value: 5000, currency: 'INR', status: 'OPEN' },
        ],
        conversations: [
          { id: 'c1', igConversationId: 'ig-1', status: 'OPEN', lastMessageAt: '2026-06-22' },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useGlobalSearch>);

    const user = userEvent.setup();
    renderWithProviders(<CommandPalette open={true} onClose={() => {}} />);

    const input = screen.getByPlaceholderText(/Search leads, deals, conversations/i);
    await user.type(input, 'John');

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Big Deal')).toBeInTheDocument();
      expect(screen.getByText('Conversation ig-1')).toBeInTheDocument();
    });
  });

  it('closes command palette when Escape key is pressed', async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette open={true} onClose={handleClose} />);

    await user.keyboard('{Escape}');
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it('closes command palette when backdrop is clicked', async () => {
    const handleClose = vi.fn();
    renderWithProviders(<CommandPalette open={true} onClose={handleClose} />);

    // Click on backdrop which has aria-hidden
    const backdrop = screen.getByRole('dialog').previousSibling;
    expect(backdrop).toBeInTheDocument();
    
    const user = userEvent.setup();
    await user.click(backdrop as HTMLElement);
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it('navigates to selected lead path and closes palette on selection', async () => {
    vi.mocked(useGlobalSearch).mockReturnValue({
      data: {
        leads: [
          { id: 'l1', firstName: 'John', lastName: 'Doe', email: 'john@example.com', phone: '123' },
        ],
        deals: [],
        conversations: [],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useGlobalSearch>);

    const handleClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette open={true} onClose={handleClose} />);

    const input = screen.getByPlaceholderText(/Search leads, deals, conversations/i);
    await user.type(input, 'John');

    const option = await screen.findByText('John Doe');
    await user.click(option);

    expect(mockPush).toHaveBeenCalledWith('/leads/l1');
    expect(handleClose).toHaveBeenCalledOnce();
  });
});
