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
                : 'px-3.5 py-2.5 rounded-xl rounded-br-md bg-primary-600 text-slate-900 text-sm'
            }
          >
            {text}
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-900/60">
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
      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs text-slate-600 shrink-0">
        {text.charAt(0).toUpperCase() || '?'}
      </div>
      <div className="flex flex-col max-w-[75%]">
        <div className="px-3.5 py-2.5 rounded-xl rounded-bl-md bg-white border border-slate-200 text-sm text-slate-900">
          {text}
        </div>
        <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500">
          <span>{formatRelativeTime(message.sentAt)}</span>
        </div>
      </div>
    </div>
  );
}
