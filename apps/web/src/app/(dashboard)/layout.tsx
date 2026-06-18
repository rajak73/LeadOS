import type { ReactNode } from 'react';

// Protected route group shell. The route guard (redirect when unauthenticated) is wired in
// Sprint 2 once auth exists. Sprint 1 ships the layout structure only.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <aside className="hidden" aria-hidden>
        {/* Sidebar nav lands with the dashboard screens. */}
      </aside>
      <main className="p-8">{children}</main>
    </div>
  );
}
