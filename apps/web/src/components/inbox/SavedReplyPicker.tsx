'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SavedReply } from '@/lib/types/api';

interface SavedReplyPickerProps {
  replies: SavedReply[];
  onSelect: (content: string) => void;
  onClose: () => void;
}

export function SavedReplyPicker({ replies, onSelect, onClose }: SavedReplyPickerProps) {
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = replies.filter(
    (r) =>
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.content.toLowerCase().includes(search.toLowerCase()) ||
      (r.shortcut?.toLowerCase().includes(search.toLowerCase()) ?? false),
  );

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filtered[activeIndex];
        if (selected) onSelect(selected.content);
      }
    },
    [filtered, activeIndex, onClose, onSelect],
  );

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (replies.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-1 bg-bg-elevated border border-border rounded-xl shadow-xl z-20 overflow-hidden"
      role="dialog"
      aria-label="Saved replies"
      onKeyDown={handleKeyDown}
    >
      <div className="p-2 border-b border-border">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search replies…"
          className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
          aria-label="Search saved replies"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-3 py-4 text-sm text-text-tertiary text-center">No replies match</p>
      ) : (
        <ul ref={listRef} role="listbox" className="max-h-56 overflow-y-auto py-1">
          {filtered.map((reply, i) => (
            <li
              key={reply.id}
              role="option"
              aria-selected={i === activeIndex}
              onClick={() => onSelect(reply.content)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`px-3 py-2 cursor-pointer ${
                i === activeIndex ? 'bg-bg-subtle' : ''
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-text-primary truncate">{reply.title}</span>
                {reply.shortcut && (
                  <span className="text-xs text-text-tertiary shrink-0">{reply.shortcut}</span>
                )}
              </div>
              <p className="text-xs text-text-secondary truncate mt-0.5">{reply.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
