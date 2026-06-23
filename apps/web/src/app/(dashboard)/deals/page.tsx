'use client';

import Link from 'next/link';

export default function DealsPage() {
  return (
    <div className="space-y-6 text-text-primary pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Deals</h1>
          <p className="text-sm text-text-secondary mt-1">Track pending transactions and revenue pipelines.</p>
        </div>
        <Link href="/pipeline">
          <button className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium">
            Go to Pipeline
          </button>
        </Link>
      </div>

      <div className="bg-bg-elevated border border-border rounded-2xl p-8 text-center space-y-4">
        <div className="w-12 h-12 bg-primary-500/10 border border-primary-500/20 rounded-full flex items-center justify-center mx-auto text-xl">
          💼
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-white">Track Your Revenue Pipeline</h3>
          <p className="text-xs text-text-secondary max-w-sm mx-auto">
            View, transition, and manage deals directly inside the visual Kanban pipeline board.
          </p>
        </div>
        <div>
          <Link href="/pipeline">
            <button className="px-3 py-1.5 text-xs border border-border rounded-lg bg-bg-base hover:bg-bg-subtle text-text-primary transition-colors">
              Open Pipeline Board
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
