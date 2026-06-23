import type { ReactNode } from 'react';
import Link from 'next/link';
import { PrimaryNavLinks } from '@/components/nav/NavLinks';
import { AppChrome } from '@/components/app/AppChrome';
import { BillingBanner } from '@/components/app/BillingBanner';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg-base text-text-primary">
      <aside className="w-56 shrink-0 border-r border-border bg-bg-elevated flex flex-col">
        <div className="px-4 py-5 border-b border-border flex items-center justify-between">
          <span className="text-sm font-semibold text-text-primary">LeadOS</span>
          <AppChrome />
        </div>
        <nav className="flex-1 px-2 py-4 space-y-0.5">
          <PrimaryNavLinks />
        </nav>
        <nav className="px-2 py-3 border-t border-border">
          <Link
            href="/settings/profile"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-subtle transition-colors"
          >
            <span>⚙️</span>
            <span>Settings</span>
          </Link>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <BillingBanner />
        {children}
      </main>
    </div>
  );
}
