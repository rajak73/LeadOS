'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ConversationList } from './ConversationList';
import { ThreadView } from './ThreadView';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSocketEvent } from '@/lib/socket/client';
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

  // The dashboard layout (AppChrome) owns the socket connection + disconnect/reconnect
  // (R-RT-1). The inbox just subscribes to inbox-specific events on the shared singleton.

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
      <aside className="w-full lg:w-72 flex flex-col border-r border-slate-200 bg-slate-50 shrink-0">
        {/* Tab bar */}
        <div className="flex gap-0 border-b border-slate-200 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-3 py-2.5 text-sm transition-colors ${
                activeTab === tab
                  ? 'text-slate-900 border-b-2 border-primary-500 -mb-px font-medium'
                  : 'text-slate-600 hover:text-slate-900'
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
          <div className="flex items-center justify-center h-full">
            <EmptyState
              icon="💬"
              title="Select a conversation to get started"
              description="Choose a conversation from the list on the left."
            />
          </div>
        )}
      </main>
    </div>
  );
}
