'use client';

// Sprint 7 M1 — dashboard chrome. Owns the single app-wide Socket.io connection (moved here
// from InboxPage per R-RT-1 so notifications are live on every page) and renders the
// notification bell. The inbox continues to subscribe to 'inbox:message' via the shared
// socket singleton, so its realtime behaviour is unchanged.

import { useEffect, useCallback } from 'react';
import { connectSocket, disconnectSocket, useSocketEvent } from '@/lib/socket/client';
import { NotificationBell } from '@/components/notifications/NotificationBell';

async function refreshAndConnect(active = true): Promise<void> {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    const json = (await res.json()) as { data?: { accessToken?: string } };
    const token = json?.data?.accessToken;
    if (token && active) connectSocket(token);
  } catch {
    // No socket on token failure — React Query polling still keeps data fresh.
  }
}

export function AppChrome() {
  useEffect(() => {
    let active = true;
    void refreshAndConnect(active);
    return () => {
      active = false;
      disconnectSocket();
    };
  }, []);

  // On disconnect (e.g. access-token expiry) refresh the token and reconnect.
  const handleDisconnect = useCallback(() => {
    void refreshAndConnect(true);
  }, []);
  useSocketEvent('disconnect', handleDisconnect);

  return <NotificationBell />;
}
