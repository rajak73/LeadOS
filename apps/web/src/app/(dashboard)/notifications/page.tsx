'use client';

import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { useNotifications, type NotificationItem } from '@/lib/hooks/useNotifications';
import { NotificationRow } from '@/components/notifications/NotificationRow';

export default function NotificationsPage() {
  const router = useRouter();
  const { notifications, unreadCount, isLoading, markRead, markAllRead } = useNotifications();

  function handleClick(n: NotificationItem) {
    if (n.readAt === null) markRead(n.id);
    if (n.entityType === 'conversation') router.push('/inbox');
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Notifications</h1>
        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" onClick={() => markAllRead()}>
            Mark all read
          </Button>
        )}
      </div>

      <div className="bg-bg-elevated border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-16 text-center text-sm text-text-tertiary">You&apos;re all caught up</div>
        ) : (
          notifications.map((n) => <NotificationRow key={n.id} notification={n} onClick={handleClick} />)
        )}
      </div>
    </div>
  );
}
