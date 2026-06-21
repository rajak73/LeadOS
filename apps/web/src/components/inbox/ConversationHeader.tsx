'use client';

import type { Conversation } from '@/lib/types/api';
import { Button } from '@/components/ui/Button';
import { useAssignConversation } from '@/lib/hooks/useAssignConversation';

interface ConversationHeaderProps {
  conversation: Conversation;
  currentUserId?: string | null;
}

export function ConversationHeader({ conversation, currentUserId }: ConversationHeaderProps) {
  const { mutate: assign, isPending } = useAssignConversation();

  const leadName = conversation.lead
    ? `${conversation.lead.firstName} ${conversation.lead.lastName ?? ''}`.trim()
    : 'Unknown';

  const igHandle = conversation.lead?.instagramHandle ?? null;

  const assigneeName = conversation.assignedTo
    ? `${conversation.assignedTo.firstName} ${conversation.assignedTo.lastName ?? ''}`.trim()
    : null;

  const isOpen = conversation.status === 'OPEN';
  const isMine = currentUserId != null && conversation.assignedToId === currentUserId;

  function handleAssignToMe() {
    if (!currentUserId) return;
    assign({ conversationId: conversation.id, assignedToId: currentUserId });
  }

  function handleToggleStatus() {
    assign({ conversationId: conversation.id, status: isOpen ? 'CLOSED' : 'OPEN' });
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-bg-base shrink-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{leadName}</p>
        {igHandle && <p className="text-xs text-text-tertiary truncate">@{igHandle}</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {assigneeName ? (
          <span className="text-xs text-text-secondary">{isMine ? 'Mine' : assigneeName}</span>
        ) : currentUserId ? (
          <Button variant="secondary" size="sm" onClick={handleAssignToMe} disabled={isPending}>
            Assign to me
          </Button>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          onClick={handleToggleStatus}
          disabled={isPending}
        >
          {isOpen ? 'Close' : 'Reopen'}
        </Button>
      </div>
    </div>
  );
}
