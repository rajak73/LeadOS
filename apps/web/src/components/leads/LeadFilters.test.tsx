import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeadFilters } from './LeadFilters';
import { renderWithProviders } from '@/test-utils';

const mockSetFilters = vi.fn();
const mockResetFilters = vi.fn();
const mockSavePreset = vi.fn();
const mockLoadPreset = vi.fn();
const mockDeletePreset = vi.fn();

vi.mock('@/lib/store/leads-store', () => ({
  useLeadsStore: () => ({
    filters: { sortBy: 'createdAt', sortOrder: 'desc', page: 1, limit: 25 },
    savedPresets: [],
    setFilters: mockSetFilters,
    resetFilters: mockResetFilters,
    savePreset: mockSavePreset,
    loadPreset: mockLoadPreset,
    deletePreset: mockDeletePreset,
  }),
}));

beforeEach(() => {
  mockSetFilters.mockClear();
  mockResetFilters.mockClear();
  mockSavePreset.mockClear();
});

describe('LeadFilters', () => {
  it('renders the filter panel', () => {
    renderWithProviders(<LeadFilters />);
    expect(screen.getByTestId('lead-filters')).toBeInTheDocument();
  });

  it('renders all status filter buttons', () => {
    renderWithProviders(<LeadFilters />);
    expect(screen.getByTestId('filter-status-NEW')).toBeInTheDocument();
    expect(screen.getByTestId('filter-status-WON')).toBeInTheDocument();
    expect(screen.getByTestId('filter-status-LOST')).toBeInTheDocument();
  });

  it('renders search input', () => {
    renderWithProviders(<LeadFilters />);
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
  });

  it('calls setFilters with search after 300ms debounce', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<LeadFilters />);
    await user.type(screen.getByTestId('search-input'), 'Ali');
    await act(async () => { await new Promise((r) => setTimeout(r, 350)); });
    expect(mockSetFilters).toHaveBeenLastCalledWith({ search: 'Ali' });
  });

  it('calls setFilters with status array when a status button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeadFilters />);
    await user.click(screen.getByTestId('filter-status-NEW'));
    expect(mockSetFilters).toHaveBeenCalledWith({ status: ['NEW'] });
  });

  it('calls resetFilters when Reset is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeadFilters />);
    await user.click(screen.getByTestId('btn-reset-filters'));
    expect(mockResetFilters).toHaveBeenCalledTimes(1);
  });

  it('calls savePreset when Save is clicked with a preset name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeadFilters />);
    await user.type(screen.getByTestId('preset-name-input'), 'My Preset');
    await user.click(screen.getByTestId('btn-save-preset'));
    expect(mockSavePreset).toHaveBeenCalledWith('My Preset');
  });

  it('calls setFilters with tags array when tags input changes', () => {
    renderWithProviders(<LeadFilters />);
    // fireEvent.change sets the full value at once — correct for controlled inputs
    // where the mock store setter doesn't re-render with the new value.
    fireEvent.change(screen.getByTestId('filter-tags'), { target: { value: 'hot, q2' } });
    expect(mockSetFilters).toHaveBeenLastCalledWith({ tags: ['hot', 'q2'] });
  });

  it('calls setFilters with assignedToId when assignedToId input changes', () => {
    renderWithProviders(<LeadFilters />);
    fireEvent.change(screen.getByTestId('filter-assignedToId'), { target: { value: 'user-abc' } });
    expect(mockSetFilters).toHaveBeenLastCalledWith({ assignedToId: 'user-abc' });
  });
});
