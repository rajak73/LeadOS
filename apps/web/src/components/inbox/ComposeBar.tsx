'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/Button';

interface ComposeBarProps {
  conversationId: string;
  onSend: (text: string) => void;
  isSending?: boolean;
}

export function ComposeBar({ onSend, isSending = false }: ComposeBarProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    onSend(trimmed);
    setText('');
    textareaRef.current?.focus();
  }, [text, isSending, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="border-t border-border bg-bg-base p-3 flex items-end gap-2">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message…"
        rows={1}
        disabled={isSending}
        className="flex-1 resize-none rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-50 min-h-[38px] max-h-32 overflow-y-auto"
      />
      <Button
        variant="primary"
        size="sm"
        onClick={handleSend}
        disabled={!text.trim() || isSending}
        className="shrink-0"
      >
        {isSending ? 'Sending…' : 'Send'}
      </Button>
    </div>
  );
}
