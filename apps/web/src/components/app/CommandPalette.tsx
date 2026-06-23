'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useGlobalSearch } from '@/lib/hooks/useGlobalSearch';
import { getLeadDisplayName } from '@/lib/types/api';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

type ResultSection = 'leads' | 'deals' | 'conversations';

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isLoading } = useGlobalSearch(query);

  // Flatten results for keyboard nav
  const flatResults = [
    ...(data?.leads ?? []).map((l) => ({
      key: `lead-${l.id}`,
      section: 'leads' as ResultSection,
      label: getLeadDisplayName(l),
      sublabel: l.email ?? l.phone ?? '',
      icon: '👤',
      href: `/leads/${l.id}`,
    })),
    ...(data?.deals ?? []).map((d) => ({
      key: `deal-${d.id}`,
      section: 'deals' as ResultSection,
      label: d.title,
      sublabel: `${d.currency} ${d.value.toLocaleString()} · ${d.status}`,
      icon: '💼',
      href: `/pipeline`,
    })),
    ...(data?.conversations ?? []).map((c) => ({
      key: `conv-${c.id}`,
      section: 'conversations' as ResultSection,
      label: `Conversation ${c.igConversationId}`,
      sublabel: c.status,
      icon: '💬',
      href: `/inbox`,
    })),
  ];

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      onClose();
    },
    [router, onClose],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        const result = flatResults[selectedIndex];
        if (result) navigate(result.href);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, flatResults, selectedIndex, navigate, onClose]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [data]);

  if (!open) return null;

  const SECTION_LABELS: Record<ResultSection, string> = {
    leads: 'Leads',
    deals: 'Deals',
    conversations: 'Conversations',
  };

  // Group for section headers
  const sectionGroups = new Map<ResultSection, typeof flatResults>();
  for (const r of flatResults) {
    const group = sectionGroups.get(r.section) ?? [];
    group.push(r);
    sectionGroups.set(r.section, group);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-xl
                   bg-bg-elevated border border-border rounded-2xl shadow-2xl shadow-black/50
                   overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <svg
            className="w-5 h-5 text-text-tertiary flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search leads, deals, conversations…"
            className="flex-1 bg-transparent text-text-primary placeholder:text-text-tertiary
                       text-base focus:outline-none"
            data-testid="command-palette-input"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-text-tertiary hover:text-text-primary transition-colors text-lg"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs
                          text-text-tertiary border border-border font-mono">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {/* Loading */}
          {isLoading && query.length >= 2 && (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Empty state */}
          {!isLoading && query.length >= 2 && flatResults.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-text-tertiary text-sm">No results for &ldquo;{query}&rdquo;</p>
            </div>
          )}

          {/* Results grouped by section */}
          {!isLoading && flatResults.length > 0 && (
            <ul>
              {Array.from(sectionGroups.entries()).map(([section, items]) => (
                <li key={section}>
                  <div className="px-4 pt-3 pb-1">
                    <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                      {SECTION_LABELS[section]}
                    </span>
                  </div>
                  {items.map((item) => {
                    const globalIndex = flatResults.indexOf(item);
                    const isSelected = globalIndex === selectedIndex;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => navigate(item.href)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                          ${isSelected ? 'bg-primary-500/10' : 'hover:bg-bg-subtle'}`}
                        data-testid={`search-result-${item.key}`}
                      >
                        <span className="text-lg flex-shrink-0">{item.icon}</span>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary-400' : 'text-text-primary'}`}>
                            {item.label}
                          </p>
                          {item.sublabel && (
                            <p className="text-xs text-text-tertiary truncate">{item.sublabel}</p>
                          )}
                        </div>
                        {isSelected && (
                          <kbd className="ml-auto text-xs text-text-tertiary font-mono">↵</kbd>
                        )}
                      </button>
                    );
                  })}
                </li>
              ))}
            </ul>
          )}

          {/* Prompt state */}
          {query.length < 2 && !isLoading && (
            <div className="py-8 text-center space-y-2">
              <p className="text-text-tertiary text-sm">Type to search across all records</p>
              <div className="flex items-center justify-center gap-4 text-xs text-text-tertiary">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-border font-mono">↑↓</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-border font-mono">↵</kbd>
                  open
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded border border-border font-mono">esc</kbd>
                  close
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
