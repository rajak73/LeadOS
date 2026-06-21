'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ConversationList } from './ConversationList';
import { ThreadView } from './ThreadView';
import { connectSocket, disconnectSocket, useSocketEvent } from '@/lib/socket/client';
import type { Conversation, Message } from '@/lib/types/api';
import type { ConversationFilters } from '@/lib/hooks/useConversations';

type InboxTab = 'all' | 'mine' | 'unassigned';

const TAB_LABELS: Record<InboxTab, string> = {
  all: 'All',
  mine: 'Mine',
  unassigned: 'Unassigned',
};

interface InboxPageProps {
  currentUserId?: string | null;
}

export function InboxPage({ currentUserId }: InboxPageProps) {
  const [activeTab, setActiveTab] = useState<InboxTab>('all');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const queryClient = useQueryClient();

  // Bootstrap socket on mount via fresh token fetch
  useEffect(() => {
    let active = true;
    fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then((res) => res.json())
      .then((json: { data?: { accessToken?: string } }) => {
        const token = json?.data?.accessToken;
        if (token && active) connectSocket(token);
      })
      .catch(() => {
        // No socket on token failure — polling still works via React Query
      });
    return () => {
      active = false;
      disconnectSocket();
    };
  }, []);

  // Socket disconnect → refresh → reconnect
  const handleDisconnect = useCallback(() => {
    fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then((res) => res.json())
      .then((json: { data?: { accessToken?: string } }) => {
        const token = json?.data?.accessToken;
        if (token) connectSocket(token);
      })
      .catch(() => undefined);
  }, []);

  useSocketEvent('disconnect', handleDisconnect);

  // New inbound message → update query cache
  const handleNewMessage = useCallback(
    (data: { conversationId: string; message: Message }) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['messages', data.conversationId] });
    },
    [queryClient],
  );

  useSocketEvent('inbox:message', handleNewMessage);

  const filters: ConversationFilters =
    activeTab === 'mine' && currentUserId
      ? { assignedToId: currentUserId }
      : activeTab === 'unassigned'
        ? { assignedToId: 'none' }
        : {};

  const tabs: InboxTab[] = ['all', 'mine', 'unassigned'];

  return (
    <div className="-m-6 flex flex-col lg:flex-row h-[calc(100svh-0px)] gap-0">
      {/* Left panel — conversation list */}
      <aside className="w-full lg:w-72 flex flex-col border-r border-border bg-bg-base shrink-0">
        {/* Tab bar */}
        <div className="flex gap-0 border-b border-border shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-3 py-2.5 text-sm transition-colors ${
                activeTab === tab
                  ? 'text-text-primary border-b-2 border-primary-500 -mb-px font-medium'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        <ConversationList
          filters={filters}
          selectedId={selectedConversation?.id ?? null}
          onSelect={setSelectedConversation}
        />
      </aside>

      {/* Center panel — thread view */}
      <main className="flex-1 flex flex-col min-w-0">
        {selectedConversation ? (
          <ThreadView
            conversation={selectedConversation}
            currentUserId={currentUserId ?? null}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <p className="text-text-secondary text-sm">Select a conversation to get started</p>
          </div>
        )}
      </main>
    </div>
  );
}
