'use client';

import dynamic from 'next/dynamic';

function KanbanSkeleton() {
  return (
    <div className="flex flex-col gap-4 h-full animate-pulse" aria-label="Loading pipeline…">
      <div className="h-9 w-48 rounded-lg bg-bg-subtle shrink-0" />
      <div className="h-6 w-32 rounded bg-bg-subtle shrink-0" />
      <div className="hidden md:flex gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-72 shrink-0 rounded-xl border border-border bg-bg-elevated p-3 flex flex-col gap-2">
            <div className="h-5 w-24 rounded bg-bg-subtle" />
            {[0, 1].map((j) => (
              <div key={j} className="h-20 rounded-lg bg-bg-subtle" />
            ))}
          </div>
        ))}
      </div>
      <div className="md:hidden rounded-xl border border-border bg-bg-elevated p-3 flex flex-col gap-2">
        <div className="h-5 w-24 rounded bg-bg-subtle" />
        {[0, 1].map((j) => (
          <div key={j} className="h-20 rounded-lg bg-bg-subtle" />
        ))}
      </div>
    </div>
  );
}

// Lazy-loads the heavy Kanban bundle (dnd-kit + framer-motion) after first paint
// so the SSR skeleton is the LCP element rather than a content-free shell.
const KanbanBoard = dynamic(
  () => import('./KanbanBoard').then((m) => ({ default: m.KanbanBoard })),
  { loading: KanbanSkeleton, ssr: false },
);

export function KanbanBoardLoader() {
  return <KanbanBoard />;
}
