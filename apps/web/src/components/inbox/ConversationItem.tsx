'use client';

import type { Conversation } from '@/lib/types/api';
import { formatRelativeTime } from '@/lib/types/api';
import { Badge } from '@/components/ui/Badge';
import { AvatarInitials } from '@/components/ui/AvatarInitials';

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}

export function ConversationItem({ conversation, isActive, onClick }: ConversationItemProps) {
  const leadName = conversation.lead
    ? `${conversation.lead.firstName} ${conversation.lead.lastName ?? ''}`.trim()
    : 'Unknown';

  const preview = conversation.igAccount?.igUsername
    ? `@${conversation.igAccount.igUsername}`
    : conversation.lead?.instagramHandle
      ? `@${conversation.lead.instagramHandle}`
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 px-4 py-3 border-b border-slate-200/40 last:border-0 cursor-pointer w-full text-left transition-colors ${
        isActive ? 'bg-slate-50 border-l-2 border-l-primary-500' : 'hover:bg-slate-50'
      }`}
    >
      <AvatarInitials name={leadName} size="md" className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-900 truncate">{leadName}</p>
          {conversation.lastMessageAt && (
            <span className="text-xs text-slate-500 shrink-0">
              {formatRelativeTime(conversation.lastMessageAt)}
            </span>
          )}
        </div>
        {preview && (
          <p className="text-xs text-slate-600 truncate mt-0.5">{preview}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1">
          {conversation.status === 'CLOSED' && (
            <Badge>Closed</Badge>
          )}
          {conversation.assignedTo && (
            <span className="text-xs text-slate-500 truncate">
              {conversation.assignedTo.firstName}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
