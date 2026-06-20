import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { DealDetailPage } from './DealDetailPage';
import { renderWithProviders, makeDeal, makePipeline } from '@/test-utils';

vi.mock('@/lib/hooks/useDealDetail', () => ({
  useDealDetail: (_id: string, initial?: import('@/lib/types/api').Deal) => ({
    data: initial ?? makeDeal(),
    isLoading: false,
  }),
}));

vi.mock('@/lib/hooks/usePipelines', () => ({
  usePipelines: () => ({ data: [makePipeline()] }),
}));

vi.mock('@/lib/hooks/useDealActions', () => ({
  useMarkWon: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkLost: () => ({ mutate: vi.fn(), isPending: false }),
  usePatchDeal: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/lib/hooks/useMoveDeal', () => ({
  useMoveDeal: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/hooks/useDealActivities', () => ({
  useDealActivities: () => ({
    data: { pages: [{ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }] },
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

describe('DealDetailPage', () => {
  it('renders deal title', () => {
    const deal = makeDeal({ title: 'Big Corp Deal' });
    renderWithProviders(<DealDetailPage dealId="deal-1" initialDeal={deal} />);
    expect(screen.getByTestId('field-title')).toHaveValue('Big Corp Deal');
  });

  it('renders Won and Lost buttons for OPEN deal', () => {
    const deal = makeDeal({ status: 'OPEN' });
    renderWithProviders(<DealDetailPage dealId="deal-1" initialDeal={deal} />);
    expect(screen.getByTestId('btn-mark-won')).toBeInTheDocument();
    expect(screen.getByTestId('btn-mark-lost')).toBeInTheDocument();
  });

  it('shows won banner for WON deal', () => {
    const deal = makeDeal({ status: 'WON' });
    renderWithProviders(<DealDetailPage dealId="deal-1" initialDeal={deal} />);
    expect(screen.getByText(/Deal Won/i)).toBeInTheDocument();
  });

  it('shows lost banner for LOST deal', () => {
    const deal = makeDeal({ status: 'LOST' });
    renderWithProviders(<DealDetailPage dealId="deal-1" initialDeal={deal} />);
    expect(screen.getByText(/Deal Lost/i)).toBeInTheDocument();
  });

  it('renders the deal detail page container', () => {
    const deal = makeDeal();
    renderWithProviders(<DealDetailPage dealId="deal-1" initialDeal={deal} />);
    expect(screen.getByTestId('deal-detail-page')).toBeInTheDocument();
  });
});
