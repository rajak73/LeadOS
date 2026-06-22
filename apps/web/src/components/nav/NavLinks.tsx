'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLinkProps {
  href: string;
  icon: string;
  label: string;
}

function NavLink({ href, icon, label }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
        isActive
          ? 'text-text-primary bg-bg-subtle font-medium'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-subtle'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

export function PrimaryNavLinks() {
  return (
    <>
      <NavLink href="/leads" icon="👥" label="Leads" />
      <NavLink href="/pipeline" icon="📊" label="Pipeline" />
      <NavLink href="/inbox" icon="💬" label="Inbox" />
      <NavLink href="/notifications" icon="🔔" label="Notifications" />
    </>
  );
}
