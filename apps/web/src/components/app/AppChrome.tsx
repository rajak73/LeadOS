'use client';

// Sprint 7 M1 — dashboard chrome. Owns the single app-wide Socket.io connection (moved here
// from InboxPage per R-RT-1 so notifications are live on every page) and renders the
// notification bell + ⌘K CommandPalette. The inbox continues to subscribe to 'inbox:message'
// via the shared socket singleton, so its realtime behaviour is unchanged.

import { useEffect, useCallback, useState } from 'react';
import { connectSocket, disconnectSocket, useSocketEvent } from '@/lib/socket/client';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { CommandPalette } from '@/components/app/CommandPalette';
import { getAccessToken, refreshAccessToken } from '@/lib/auth/token-store';

async function refreshAndConnect(active = true): Promise<void> {
  try {
    let token = getAccessToken();
    if (!token) {
      token = await refreshAccessToken();
    }
    if (token && active) connectSocket(token);
  } catch {
    // No socket on token failure — React Query polling still keeps data fresh.
  }
}

export function AppChrome() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void refreshAndConnect(active);
    return () => {
      active = false;
      disconnectSocket();
    };
  }, []);

  // ⌘K / Ctrl+K opens the command palette globally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // On disconnect (e.g. access-token expiry) refresh the token and reconnect.
  const handleDisconnect = useCallback(() => {
    void refreshAndConnect(true);
  }, []);
  useSocketEvent('disconnect', handleDisconnect);

  return (
    <>
      <div className="flex items-center gap-2">
        {/* ⌘K search trigger button */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          title="Search (⌘K)"
          data-testid="cmd-palette-trigger"
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-slate-500
                     hover:text-slate-900 hover:bg-slate-50 border border-slate-200
                     transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <kbd className="font-mono">⌘K</kbd>
        </button>
        <NotificationBell />
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
