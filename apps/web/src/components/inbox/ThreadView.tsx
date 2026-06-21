'use client';

import { useEffect, useRef } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { MessageBubble } from './MessageBubble';
import { ComposeBar } from './ComposeBar';
import { ConversationHeader } from './ConversationHeader';
import { WindowExpiredBanner } from './WindowExpiredBanner';
import { useMessages } from '@/lib/hooks/useMessages';
import { useSendMessage } from '@/lib/hooks/useSendMessage';
import { MESSAGING_WINDOW_MS } from '@/lib/types/api';
import type { Conversation } from '@/lib/types/api';

interface ThreadViewProps {
  conversation: Conversation;
  currentUserId?: string | null;
}

export function ThreadView({ conversation, currentUserId }: ThreadViewProps) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(conversation.id);
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const bottomRef = useRef<HTMLDivElement>(null);

  const allMessages = data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages.length]);

  const windowExpired =
    conversation.lastInboundAt != null &&
    Date.now() - new Date(conversation.lastInboundAt).getTime() > MESSAGING_WINDOW_MS;

  function handleSend(text: string) {
    sendMessage({ conversationId: conversation.id, text });
  }

  return (
    <div className="flex flex-col h-full bg-bg-base">
      <ConversationHeader conversation={conversation} currentUserId={currentUserId ?? null} />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {hasNextPage && (
          <div className="flex justify-center mb-3">
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              {isFetchingNextPage ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}
        {isLoading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
        {allMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {windowExpired ? (
        <WindowExpiredBanner />
      ) : (
        <ComposeBar
          conversationId={conversation.id}
          onSend={handleSend}
          isSending={isSending}
        />
      )}
    </div>
  );
}
