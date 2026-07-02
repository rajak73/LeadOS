'use client';

import type { NotificationItem } from '@/lib/hooks/useNotifications';

interface NotificationRowProps {
  notification: NotificationItem;
  onClick?: (n: NotificationItem) => void;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationRow({ notification, onClick }: NotificationRowProps) {
  const unread = notification.readAt === null;
  return (
    <button
      type="button"
      onClick={() => onClick?.(notification)}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-200/40 last:border-0 transition-colors hover:bg-slate-50 ${
        unread ? '' : 'opacity-60'
      }`}
    >
      <span
        className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${unread ? 'bg-primary-500' : 'bg-transparent'}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${unread ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>
            {notification.title}
          </span>
          <span className="text-xs text-slate-500 shrink-0">{relativeTime(notification.createdAt)}</span>
        </span>
        <span className="block text-xs text-slate-600 truncate mt-0.5">{notification.body}</span>
      </span>
    </button>
  );
}
