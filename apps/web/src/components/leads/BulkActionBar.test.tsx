import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkActionBar } from './BulkActionBar';
import { renderWithProviders } from '@/test-utils';
import { useBulkLeads } from '@/lib/hooks/useBulkLeads';

vi.mock('@/lib/hooks/useBulkLeads', () => ({
  useBulkLeads: vi.fn(),
}));

describe('BulkActionBar', () => {
  const mockMutate = vi.fn();
  const mockClearSelection = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockReset();
    mockClearSelection.mockReset();
    vi.mocked(useBulkLeads).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useBulkLeads>);
  });

  it('renders null when selectedIds is empty', () => {
    const { container } = renderWithProviders(
      <BulkActionBar selectedIds={[]} onClearSelection={mockClearSelection} />
    );
    expect(container.querySelector('[data-testid="bulk-action-bar"]')).toBeNull();
  });

  it('renders selection count and buttons when selectedIds has items', () => {
    renderWithProviders(
      <BulkActionBar selectedIds={['1', '2']} onClearSelection={mockClearSelection} />
    );

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/leads selected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set status/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add tags/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('displays status dropdown and triggers status change on select', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BulkActionBar selectedIds={['1', '2']} onClearSelection={mockClearSelection} />
    );

    const statusButton = screen.getByRole('button', { name: /set status/i });
    await user.click(statusButton);

    // Dropdown list options
    expect(screen.getByText('CONTACTED')).toBeInTheDocument();
    
    await user.click(screen.getByText('CONTACTED'));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update-status',
        ids: ['1', '2'],
        status: 'CONTACTED',
      }),
      expect.any(Object)
    );
  });

  it('displays tags popup and triggers tags add on submit', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BulkActionBar selectedIds={['1', '2']} onClearSelection={mockClearSelection} />
    );

    const tagsButton = screen.getByRole('button', { name: /add tags/i });
    await user.click(tagsButton);

    const input = screen.getByPlaceholderText('urgent, vip, follow-up');
    await user.type(input, 'important, follow-up');
    
    const applyButton = screen.getByRole('button', { name: /apply tags/i });
    await user.click(applyButton);

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'add-tags',
        ids: ['1', '2'],
        tags: ['important', 'follow-up'],
      }),
      expect.any(Object)
    );
  });

  it('displays delete confirmation and triggers delete on ok', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    
    const user = userEvent.setup();
    renderWithProviders(
      <BulkActionBar selectedIds={['1', '2']} onClearSelection={mockClearSelection} />
    );

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await user.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete',
        ids: ['1', '2'],
      }),
      expect.any(Object)
    );

    confirmSpy.mockRestore();
  });
});
