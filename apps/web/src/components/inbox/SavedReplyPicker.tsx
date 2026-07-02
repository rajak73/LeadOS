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
      className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-300 rounded-xl shadow-2xl z-20 overflow-hidden ring-1 ring-slate-200 origin-bottom animate-in fade-in slide-in-from-bottom-2 duration-200"
      role="dialog"
      aria-label="AI Suggested replies"
      onKeyDown={handleKeyDown}
    >
      <div className="p-3 border-b border-slate-300 bg-slate-50/50 flex items-center gap-3">
        <span className="text-ai-start text-base pointer-events-none">✨</span>
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search AI replies & templates…"
          className="w-full bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-500 outline-none"
          aria-label="Search saved replies"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-3 py-4 text-sm text-slate-500 text-center">No replies match</p>
      ) : (
        <ul ref={listRef} role="listbox" className="max-h-56 overflow-y-auto py-1">
          {filtered.map((reply, i) => (
            <li
              key={reply.id}
              role="option"
              aria-selected={i === activeIndex}
              onClick={() => onSelect(reply.content)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`px-4 py-3 cursor-pointer transition-colors border-l-2 ${
                i === activeIndex ? 'bg-slate-50 border-ai-start' : 'border-transparent hover:bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between min-w-0 mb-1">
                <span className="text-sm font-semibold text-slate-900 truncate">{reply.title}</span>
                {reply.shortcut && (
                  <span className="text-[10px] font-mono text-primary-400 bg-primary-500/10 ring-1 ring-primary-500/20 px-1.5 py-0.5 rounded shrink-0 ml-2">{reply.shortcut}</span>
                )}
              </div>
              <p className="text-xs text-slate-600 truncate">{reply.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
