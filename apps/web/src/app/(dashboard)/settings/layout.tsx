import type { ReactNode } from 'react';
import Link from 'next/link';

const NAV_ITEMS = [
  { href: '/settings/profile', label: 'Profile', icon: '👤' },
  { href: '/settings/team', label: 'Team & Roles', icon: '👥' },
  { href: '/settings/billing', label: 'Billing', icon: '💳' },
  { href: '/settings/integrations/instagram', label: 'Meta (IG & FB)', icon: '💬' },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="text-sm text-text-tertiary mt-1">
          Manage your account, team, and integrations
        </p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar nav */}
        <aside className="w-48 shrink-0">
          <nav className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                           text-text-secondary hover:text-text-primary hover:bg-bg-subtle
                           transition-colors group"
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
