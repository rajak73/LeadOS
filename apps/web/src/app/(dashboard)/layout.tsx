'use client';

import { type ReactNode, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { AppChrome } from '@/components/app/AppChrome';
import { BillingBanner } from '@/components/app/BillingBanner';
import { setAccessToken } from '@/lib/auth/token-store';
import { apiClient } from '@/lib/api-client';

interface NavItem {
  href: string;
  label: string;
  icon: (active: boolean) => ReactNode;
  badge?: number;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState<{ firstName: string; lastName: string; email: string } | null>(null);
  const [org, setOrg] = useState<{ name: string } | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const verifyStarted = useRef(false);

  useEffect(() => {
    if (verifyStarted.current) return;
    verifyStarted.current = true;

    async function verifySession() {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (!res.ok) {
          router.replace('/login');
          return;
        }
        const json = await res.json();
        const token = json?.data?.accessToken;
        if (token) {
          setAccessToken(token);
          // Fetch current user details via the authenticated API client
          const meRes = await apiClient.get('/auth/me');
          if (meRes.data?.success) {
            setUser(meRes.data.data.user);
            setOrg(meRes.data.data.organization);
          }
        }
        setCheckingAuth(false);
      } catch (err) {
        console.error('Session verification failed:', err);
        router.replace('/login');
      }
    }
    verifySession();
  }, [router]);

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0f] text-text-primary">
        <div className="space-y-4 text-center">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-text-secondary">Securing your workspace...</p>
        </div>
      </div>
    );
  }

  const navItems: NavItem[] = [
    {
      href: '/',
      label: 'Dashboard',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-white' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
        </svg>
      ),
    },
    {
      href: '/leads',
      label: 'Leads',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-white' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
    },
    {
      href: '/contacts',
      label: 'Contacts',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-white' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-7 4h10" />
        </svg>
      ),
    },
    {
      href: '/deals',
      label: 'Deals',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-white' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      href: '/pipeline',
      label: 'Pipeline',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-white' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
      ),
    },
    {
      href: '/inbox',
      label: 'Inbox',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-white' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      badge: 12,
    },
    {
      href: '/tasks',
      label: 'Tasks',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-white' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      href: '/workflows',
      label: 'Workflows',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-white' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      href: '/analytics',
      label: 'Analytics',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-white' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
        </svg>
      ),
    },
    {
      href: '/reports',
      label: 'Reports',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-white' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      href: '/settings/profile',
      label: 'Settings',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-white' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      href: '/settings/team',
      label: 'Team',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-white' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      href: '/settings/billing',
      label: 'Billing',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-white' : 'text-text-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
  ];

  const userName = user ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Rohan Kumar';
  const orgName = org?.name || 'Acme Corp';
  const userInitials = user ? `${user.firstName[0]}${user.lastName ? user.lastName[0] : ''}`.toUpperCase() : 'RK';

  return (
    <div className="flex min-h-screen bg-[#08080c] text-text-primary">
      {/* Sidebar navigation */}
      <aside
        className={`${
          isCollapsed ? 'w-16' : 'w-64'
        } shrink-0 border-r border-border/50 bg-[#0c0c14] flex flex-col transition-all duration-300 z-30 select-none`}
      >
        {/* Brand logo header */}
        <div className="px-5 py-5 border-b border-border/20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary-600 to-indigo-500 flex items-center justify-center shrink-0 shadow-md">
              <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24">
                <path d="M12 2L2 22h20L12 2zm0 4l6.5 13H5.5L12 6z" />
              </svg>
            </div>
            {!isCollapsed && (
              <span className="text-base font-bold text-white tracking-wide">
                Lead<span className="text-primary-400">OS</span>
              </span>
            )}
          </Link>
          {!isCollapsed && <AppChrome />}
        </div>

        {/* Links list */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all group ${
                  isActive
                    ? 'text-white bg-gradient-to-r from-primary-600/90 to-indigo-600/90 shadow-md shadow-primary-900/10'
                    : 'text-text-secondary hover:text-text-primary hover:bg-[#151522]'
                }`}
                title={item.label}
              >
                <div className="shrink-0">{item.icon(isActive)}</div>
                {!isCollapsed && <span className="flex-1">{item.label}</span>}
                {!isCollapsed && item.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-primary-500/15 text-primary-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Trial box */}
        {!isCollapsed && (
          <div className="px-4 py-3 mx-3 my-2 rounded-2xl bg-[#11111e] border border-border/20 space-y-2.5">
            <div className="space-y-1">
              <p className="text-[10px] text-text-tertiary uppercase font-bold tracking-wider">Your trial ends in</p>
              <h4 className="text-xs font-bold text-white">14 days</h4>
            </div>
            <div className="h-1.5 rounded-full bg-bg-base overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-indigo-400 w-1/3" />
            </div>
            <Link href="/settings/billing" className="block">
              <button className="w-full py-1.5 text-[10px] font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors shadow">
                Upgrade to keep growing
              </button>
            </Link>
          </div>
        )}

        {/* Profile section */}
        <div className="p-3 border-t border-border/20">
          {!isCollapsed ? (
            <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#151522] transition-colors cursor-pointer group">
              <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center font-bold text-white text-xs border border-primary-500/30">
                {userInitials}
              </div>
              <div className="flex-1 overflow-hidden">
                <h4 className="text-xs font-bold text-white truncate leading-normal">{userName}</h4>
                <p className="text-[10px] text-text-tertiary truncate leading-none">{orgName}</p>
              </div>
              <svg className="w-4 h-4 text-text-tertiary group-hover:text-text-secondary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          ) : (
            <div className="flex items-center justify-center p-2">
              <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center font-bold text-white text-xs border border-primary-500/30">
                {userInitials}
              </div>
            </div>
          )}

          {/* Collapse sidebar button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full flex items-center gap-3 px-3 py-2 mt-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-text-tertiary hover:text-text-primary hover:bg-[#151522] transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            {!isCollapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main page content area */}
      <main className="flex-1 overflow-auto p-6">
        <BillingBanner />
        {children}
      </main>
    </div>
  );
}
