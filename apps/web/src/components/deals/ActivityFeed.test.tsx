import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { ActivityFeed } from './ActivityFeed';
import { renderWithProviders } from '@/test-utils';
import type { ActivityItem } from '@/lib/types/api';

function makeActivity(overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: 'act-1',
    organizationId: 'org-1',
    actorId: 'user-1',
    activityType: 'DEAL_CREATED',
    entityType: 'DEAL',
    entityId: 'deal-1',
    metadata: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

vi.mock('@/lib/hooks/useDealActivities', () => ({
  useDealActivities: (dealId: string) => ({
    data: dealId === 'empty'
      ? { pages: [{ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }] }
      : {
          pages: [{
            data: [
              makeActivity({ id: 'act-1', activityType: 'DEAL_CREATED' }),
              makeActivity({ id: 'act-2', activityType: 'DEAL_STAGE_MOVED', metadata: { toStageName: 'Qualified' } }),
            ],
            meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
          }],
        },
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

describe('ActivityFeed', () => {
  it('renders activity items', () => {
    renderWithProviders(<ActivityFeed dealId="deal-1" />);
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    expect(screen.getByText('Deal created')).toBeInTheDocument();
    expect(screen.getByText('Moved to Qualified')).toBeInTheDocument();
  });

  it('shows empty state when no activities', () => {
    renderWithProviders(<ActivityFeed dealId="empty" />);
    expect(screen.getByText(/No activity yet/i)).toBeInTheDocument();
  });

  it('does not render the feed container when empty', () => {
    renderWithProviders(<ActivityFeed dealId="empty" />);
    expect(screen.queryByTestId('activity-feed')).not.toBeInTheDocument();
  });
});
