'use client';

import { useState } from 'react';
import type { Conversation } from '@/lib/types/api';
import { Button } from '@/components/ui/Button';
import { useAssignConversation } from '@/lib/hooks/useAssignConversation';
import { CreateLeadModal } from './CreateLeadModal';

interface ConversationHeaderProps {
  conversation: Conversation;
  currentUserId?: string | null;
}

export function ConversationHeader({ conversation, currentUserId }: ConversationHeaderProps) {
  const { mutate: assign, isPending } = useAssignConversation();
  const [createLeadOpen, setCreateLeadOpen] = useState(false);

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
    <>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{leadName}</p>
          {igHandle && <p className="text-xs text-slate-500 truncate">@{igHandle}</p>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* "→ Lead" button — shown only when conversation has no linked lead */}
          {!conversation.leadId && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCreateLeadOpen(true)}
              disabled={isPending}
            >
              → Lead
            </Button>
          )}

          {assigneeName ? (
            <span className="text-xs text-slate-600">{isMine ? 'Mine' : assigneeName}</span>
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

      <CreateLeadModal
        conversation={conversation}
        open={createLeadOpen}
        onOpenChange={setCreateLeadOpen}
      />
    </>
  );
}
