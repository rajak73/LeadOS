'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketEvent } from '@/lib/socket/client';
import { useNotifications, type NotificationItem } from '@/lib/hooks/useNotifications';
import { NotificationPanel } from './NotificationPanel';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { unreadCount } = useNotifications();

  // Live updates — a 'notification' socket event invalidates the cache (bell + panel refresh).
  const onSocketNotification = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [queryClient]);
  useSocketEvent('notification', onSocketNotification);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  function navigate(n: NotificationItem) {
    setOpen(false);
    if (n.entityType === 'conversation') router.push('/inbox');
  }

  const badge = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center h-9 w-9 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
      >
        <span aria-hidden>🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 flex items-center justify-center text-[10px] font-medium rounded-full bg-primary-500/15 text-primary-400 border border-primary-500/30">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50">
          <NotificationPanel onClose={() => setOpen(false)} onNavigate={navigate} />
        </div>
      )}
    </div>
  );
}
