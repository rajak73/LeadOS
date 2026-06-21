'use client';

import { useRef, useCallback } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { ConversationItem } from './ConversationItem';
import { useConversations, type ConversationFilters } from '@/lib/hooks/useConversations';
import type { Conversation } from '@/lib/types/api';

interface ConversationListProps {
  filters: ConversationFilters;
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
}

export function ConversationList({ filters, selectedId, onSelect }: ConversationListProps) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useConversations(filters);

  const conversations = data?.pages.flatMap((p) => p.items) ?? [];

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      });
      observerRef.current.observe(node);
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!conversations.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <p className="text-sm text-text-secondary">No conversations</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto flex-1">
      {conversations.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          isActive={conversation.id === selectedId}
          onClick={() => onSelect(conversation)}
        />
      ))}
      <div ref={sentinelRef} className="h-1" />
      {isFetchingNextPage && (
        <div className="flex justify-center py-3">
          <Spinner />
        </div>
      )}
    </div>
  );
}
