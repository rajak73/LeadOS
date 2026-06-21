'use client';

import type { Conversation } from '@/lib/types/api';
import { formatRelativeTime } from '@/lib/types/api';
import { Badge } from '@/components/ui/Badge';

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}

export function ConversationItem({ conversation, isActive, onClick }: ConversationItemProps) {
  const leadName = conversation.lead
    ? `${conversation.lead.firstName} ${conversation.lead.lastName ?? ''}`.trim()
    : 'Unknown';

  const preview = '';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 px-4 py-3 border-b border-border/40 last:border-0 cursor-pointer w-full text-left transition-colors ${
        isActive ? 'bg-bg-subtle' : 'hover:bg-bg-subtle'
      }`}
    >
      <div className="w-8 h-8 rounded-full bg-bg-muted flex items-center justify-center text-xs font-medium text-text-secondary shrink-0">
        {leadName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-text-primary truncate">{leadName}</p>
          {conversation.lastMessageAt && (
            <span className="text-xs text-text-tertiary shrink-0">
              {formatRelativeTime(conversation.lastMessageAt)}
            </span>
          )}
        </div>
        {preview && (
          <p className="text-xs text-text-secondary truncate mt-0.5">{preview}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1">
          {conversation.status === 'CLOSED' && (
            <Badge>Closed</Badge>
          )}
          {conversation.assignedTo && (
            <span className="text-xs text-text-tertiary truncate">
              {conversation.assignedTo.firstName}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
