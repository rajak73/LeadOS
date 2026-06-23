'use client';

import { useQuery } from '@tanstack/react-query';

export interface DashboardAnalyticsData {
  totalLeads: number;
  statusBreakdown: {
    NEW: number;
    CONTACTED: number;
    QUALIFIED: number;
    LOST: number;
    WON: number;
  };
  sourceBreakdown: {
    source: string;
    count: number;
  }[];
  deals: {
    count: number;
    totalValue: number;
  };
  leadsGrowth: {
    date: string;
    count: number;
  }[];
  computedAt: string;
}

export function useDashboardAnalytics() {
  return useQuery<DashboardAnalyticsData>({
    queryKey: ['dashboard-analytics'],
    queryFn: async () => {
      const res = await fetch('/api/bff/analytics/dashboard', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch dashboard analytics');
      }
      const json = await res.json();
      return json.data;
    },
    staleTime: 60_000,
  });
}
