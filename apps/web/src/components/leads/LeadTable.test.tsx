import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeadTable } from './LeadTable';
import { renderWithProviders, makeLead } from '@/test-utils';

const LEADS = [
  makeLead({ id: 'lead-1', firstName: 'Alice', lastName: 'Smith', status: 'NEW' }),
  makeLead({ id: 'lead-2', firstName: 'Bob', lastName: 'Jones', status: 'CONTACTED' }),
];

const mockSetFilters = vi.fn();

vi.mock('@/lib/store/leads-store', () => ({
  useLeadsStore: () => ({
    filters: { sortBy: 'createdAt', sortOrder: 'desc', page: 1, limit: 25 },
    savedPresets: [],
    setFilters: mockSetFilters,
    resetFilters: vi.fn(),
    savePreset: vi.fn(),
    loadPreset: vi.fn(),
    deletePreset: vi.fn(),
  }),
}));

vi.mock('@/lib/hooks/useLeads', () => ({
  useLeads: () => ({
    data: {
      data: LEADS,
      meta: { page: 1, limit: 25, total: 2, totalPages: 1 },
    },
    isLoading: false,
  }),
}));

vi.mock('@/lib/hooks/useLeadActions', () => ({
  usePatchLead: () => ({ mutate: vi.fn() }),
  useDeleteLead: () => ({ mutate: vi.fn() }),
  useConvertLead: () => ({ mutate: vi.fn() }),
  useCreateLead: () => ({ mutate: vi.fn() }),
}));

beforeEach(() => mockSetFilters.mockClear());

describe('LeadTable', () => {
  it('renders lead rows', () => {
    renderWithProviders(<LeadTable onImport={vi.fn()} onExport={vi.fn()} />);
    expect(screen.getByTestId('lead-row-lead-1')).toBeInTheDocument();
    expect(screen.getByTestId('lead-row-lead-2')).toBeInTheDocument();
  });

  it('renders lead names as links', () => {
    renderWithProviders(<LeadTable onImport={vi.fn()} onExport={vi.fn()} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('shows total count in toolbar', () => {
    renderWithProviders(<LeadTable onImport={vi.fn()} onExport={vi.fn()} />);
    expect(screen.getByText('2 leads')).toBeInTheDocument();
  });

  it('calls onImport when Import CSV is clicked', async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    renderWithProviders(<LeadTable onImport={onImport} onExport={vi.fn()} />);
    await user.click(screen.getByTestId('btn-import-csv'));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it('calls onExport when Export CSV is clicked', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    renderWithProviders(<LeadTable onImport={vi.fn()} onExport={onExport} />);
    await user.click(screen.getByTestId('btn-export-csv'));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('calls setFilters with sortBy=firstName when Name column is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeadTable onImport={vi.fn()} onExport={vi.fn()} />);
    await user.click(screen.getByTestId('sort-firstName'));
    expect(mockSetFilters).toHaveBeenCalledWith({ sortBy: 'firstName', sortOrder: 'desc' });
  });

  it('renders inline status dropdown for non-terminal lead', () => {
    renderWithProviders(<LeadTable onImport={vi.fn()} onExport={vi.fn()} />);
    expect(screen.getByTestId('status-select-lead-1')).toBeInTheDocument();
  });
});
