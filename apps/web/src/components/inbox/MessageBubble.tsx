'use client';

import type { Message, MessageStatus } from '@/lib/types/api';
import { formatRelativeTime } from '@/lib/types/api';
import { Button } from '@/components/ui/Button';

function statusChar(status: MessageStatus): string {
  if (status === 'READ') return '✓✓';
  if (status === 'DELIVERED') return '✓';
  if (status === 'FAILED') return '';
  return '·';
}

interface MessageBubbleProps {
  message: Message;
  onRetry?: (messageId: string) => void;
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isOutbound = message.direction === 'OUTBOUND';
  const isFailed = message.status === 'FAILED';
  const text = message.content.text ?? '';

  if (isOutbound) {
    return (
      <div className="flex items-end gap-2 mb-3 flex-row-reverse">
        <div className="flex flex-col items-end max-w-[75%]">
          <div
            className={
              isFailed
                ? 'px-3.5 py-2.5 rounded-xl rounded-br-md bg-red-500/15 border border-red-500/30 text-red-400 text-sm'
                : 'px-3.5 py-2.5 rounded-xl rounded-br-md bg-primary-600 text-white text-sm'
            }
          >
            {text}
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-xs text-white/60">
            <span>{formatRelativeTime(message.sentAt)}</span>
            {isFailed ? (
              <Button variant="ghost" size="sm" onClick={() => onRetry?.(message.id)}>
                Failed · Retry
              </Button>
            ) : (
              <span>{statusChar(message.status)}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 mb-3">
      <div className="w-6 h-6 rounded-full bg-bg-muted flex items-center justify-center text-xs text-text-secondary shrink-0">
        {text.charAt(0).toUpperCase() || '?'}
      </div>
      <div className="flex flex-col max-w-[75%]">
        <div className="px-3.5 py-2.5 rounded-xl rounded-bl-md bg-bg-elevated border border-border text-sm text-text-primary">
          {text}
        </div>
        <div className="flex items-center gap-1 mt-0.5 text-xs text-text-tertiary">
          <span>{formatRelativeTime(message.sentAt)}</span>
        </div>
      </div>
    </div>
  );
}
