import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { LeadDetailPage } from './LeadDetailPage';
import { renderWithProviders, makeLead } from '@/test-utils';

vi.mock('@/lib/hooks/useLeadDetail', () => ({
  useLeadDetail: (_id: string, initial?: import('@/lib/types/api').Lead) => ({
    data: initial ?? makeLead(),
    isLoading: false,
  }),
}));

vi.mock('@/lib/hooks/useLeadActions', () => ({
  useConvertLead: () => ({ mutate: vi.fn(), isPending: false }),
  usePatchLead: () => ({ mutate: vi.fn() }),
  useDeleteLead: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/lib/hooks/useLeadActivities', () => ({
  useLeadActivities: () => ({
    data: { pages: [{ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }] },
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

vi.mock('@/lib/hooks/useLeadNotes', () => ({
  useLeadNotes: () => ({ data: { data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 0 } }, isLoading: false }),
}));

vi.mock('@/lib/hooks/useLeadFiles', () => ({
  useLeadFiles: () => ({ data: { data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 0 } }, isLoading: false }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: (opts: { queryKey: string[] }) => {
      if (opts.queryKey[0] === 'deals-for-lead') return { data: [], isLoading: false };
      return actual.useQuery(opts);
    },
  };
});

describe('LeadDetailPage', () => {
  it('renders the page container', () => {
    renderWithProviders(<LeadDetailPage leadId="lead-1" initialLead={makeLead()} />);
    expect(screen.getByTestId('lead-detail-page')).toBeInTheDocument();
  });

  it('renders lead name in first-name field', () => {
    const lead = makeLead({ firstName: 'Bob', lastName: 'Jones' });
    renderWithProviders(<LeadDetailPage leadId="lead-1" initialLead={lead} />);
    expect(screen.getByTestId('field-firstName')).toHaveValue('Bob');
  });

  it('renders status badge', () => {
    const lead = makeLead({ status: 'QUALIFIED' });
    renderWithProviders(<LeadDetailPage leadId="lead-1" initialLead={lead} />);
    expect(screen.getByTestId('status-badge-QUALIFIED')).toBeInTheDocument();
  });

  it('shows Convert to Contact button for active lead', () => {
    const lead = makeLead({ status: 'CONTACTED', convertedToContactId: null });
    renderWithProviders(<LeadDetailPage leadId="lead-1" initialLead={lead} />);
    expect(screen.getByTestId('btn-convert-lead')).toBeInTheDocument();
  });

  it('shows won banner for WON lead', () => {
    const lead = makeLead({ status: 'WON' });
    renderWithProviders(<LeadDetailPage leadId="lead-1" initialLead={lead} />);
    expect(screen.getByText(/Lead Won/i)).toBeInTheDocument();
  });

  it('shows lost banner for LOST lead', () => {
    const lead = makeLead({ status: 'LOST', lostReason: 'Budget cut' });
    renderWithProviders(<LeadDetailPage leadId="lead-1" initialLead={lead} />);
    expect(screen.getByText(/Lead Lost/i)).toBeInTheDocument();
  });
});
