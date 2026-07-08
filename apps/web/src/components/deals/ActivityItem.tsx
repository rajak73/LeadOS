'use client';

import { formatRelativeTime } from '@/lib/types/api';
import type { ActivityItem as Activity } from '@/lib/types/api';

const ICONS: Record<string, string> = {
  DEAL_CREATED: '✦',
  DEAL_UPDATED: '✎',
  DEAL_STAGE_MOVED: '→',
  DEAL_WON: '✓',
  DEAL_LOST: '✗',
};

function describeActivity(item: Activity): string {
  const m = item.metadata ?? {};
  switch (item.activityType) {
    case 'DEAL_CREATED':
      return m['value'] ? `Deal created — ${m['value'] as string}` : 'Deal created';
    case 'DEAL_UPDATED':
      return `Updated ${Array.isArray(m['fields']) ? (m['fields'] as string[]).join(', ') : 'fields'}`;
    case 'DEAL_STAGE_MOVED':
      return `Moved to ${(m['toStageName'] as string) ?? 'new stage'}`;
    case 'DEAL_WON':
      return 'Deal marked as Won';
    case 'DEAL_LOST':
      return m['reason'] ? `Marked as Lost — ${m['reason'] as string}` : 'Deal marked as Lost';
    default:
      return item.activityType.replace(/_/g, ' ').toLowerCase();
  }
}

export function ActivityItemRow({ item }: { item: Activity }) {
  const icon = ICONS[item.activityType] ?? '·';

  return (
    <div className="flex gap-3 py-3 border-b border-slate-200/40 last:border-0">
      <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center text-xs text-slate-600 shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900">{describeActivity(item)}</p>
        <p className="text-xs text-slate-500 mt-0.5">{formatRelativeTime(item.createdAt)}</p>
      </div>
    </div>
  );
}
