'use client';

import { useEffect, useRef } from 'react';
import { useLeadActivities } from '@/lib/hooks/useLeadActivities';
import { ActivityItemRow } from '@/components/deals/ActivityItem';
import { Spinner } from '@/components/ui/Spinner';

interface LeadActivityFeedProps {
  leadId: string;
}

export function LeadActivityFeed({ leadId }: LeadActivityFeedProps) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useLeadActivities(leadId);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  const activities = data?.pages.flatMap((p) => p.data) ?? [];

  if (activities.length === 0) {
    return <div className="py-8 text-center text-sm text-text-tertiary">No activity yet</div>;
  }

  return (
    <div data-testid="lead-activity-feed">
      {activities.map((item) => (
        <ActivityItemRow key={item.id} item={item} />
      ))}
      <div ref={sentinelRef} className="py-1">
        {isFetchingNextPage && (
          <div className="flex justify-center py-2">
            <Spinner size="sm" />
          </div>
        )}
      </div>
    </div>
  );
}
