'use client';

import Link from 'next/link';
import { Spinner } from '@/components/ui/Spinner';
import { useNotifications, type NotificationItem } from '@/lib/hooks/useNotifications';
import { NotificationRow } from './NotificationRow';

interface NotificationPanelProps {
  onClose: () => void;
  onNavigate?: (n: NotificationItem) => void;
}

export function NotificationPanel({ onClose, onNavigate }: NotificationPanelProps) {
  const { notifications, unreadCount, isLoading, markRead, markAllRead } = useNotifications();

  function handleClick(n: NotificationItem) {
    if (n.readAt === null) markRead(n.id);
    onNavigate?.(n);
  }

  return (
    <div className="w-80 bg-bg-elevated border border-border rounded-xl shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-text-primary">Notifications</span>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead()}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="md" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-10 text-center text-sm text-text-tertiary">You&apos;re all caught up</div>
        ) : (
          notifications.map((n) => <NotificationRow key={n.id} notification={n} onClick={handleClick} />)
        )}
      </div>

      <div className="border-t border-border px-4 py-2.5 text-center">
        <Link
          href="/notifications"
          onClick={onClose}
          className="text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          View all notifications
        </Link>
      </div>
    </div>
  );
}
