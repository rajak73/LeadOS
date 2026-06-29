'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { SavedReplyPicker } from './SavedReplyPicker';
import { useSavedReplies } from '@/lib/hooks/useSavedReplies';

interface ComposeBarProps {
  conversationId: string;
  onSend: (text: string) => void;
  isSending?: boolean;
}

export function ComposeBar({ conversationId: _conversationId, onSend, isSending = false }: ComposeBarProps) {
  const [text, setText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: savedReplies = [] } = useSavedReplies();

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    onSend(trimmed);
    setText('');
    setPickerOpen(false);
    textareaRef.current?.focus();
  }, [text, isSending, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === '/') {
        setPickerOpen(true);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleReplySelect = useCallback((content: string) => {
    setText(content);
    setPickerOpen(false);
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="border-t border-border bg-bg-base p-3 flex flex-col gap-2">
      <div className="relative">
        {pickerOpen && savedReplies.length > 0 && (
          <SavedReplyPicker
            replies={savedReplies}
            onSelect={handleReplySelect}
            onClose={() => setPickerOpen(false)}
          />
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          rows={3}
          disabled={isSending}
          className="w-full resize-none rounded-lg border border-border bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 transition-colors disabled:opacity-50"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-text-secondary flex items-center gap-1.5 font-medium tracking-wide">
          <span className="text-ai-start text-xs">✨</span>
          Press <kbd className="bg-bg-subtle px-1.5 py-0.5 rounded ring-1 ring-border-strong font-mono">/</kbd> for AI replies
        </span>
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
    </div>
  );
}
