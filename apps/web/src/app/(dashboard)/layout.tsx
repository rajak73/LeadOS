'use client';

import { type ReactNode, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { AppChrome } from '@/components/app/AppChrome';
import { BillingBanner } from '@/components/app/BillingBanner';
import { getAccessToken, refreshAccessToken } from '@/lib/auth/token-store';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const verifyStarted = useRef(false);

  useEffect(() => {
    if (verifyStarted.current) return;
    verifyStarted.current = true;

    async function verifySession() {
      try {
        let token = getAccessToken();
        if (!token) {
          token = await refreshAccessToken();
          if (!token) {
            router.replace('/login');
            return;
          }
        }
        // Fetch current user details
        const meRes = await apiClient.get('/auth/me');
        if (meRes.data?.success) {
          setUser(meRes.data.data);
        }
        
        // Fetch organization details
        const orgRes = await apiClient.get('/organizations');
        if (orgRes.data?.success) {
          const organization = orgRes.data.data.organization;
          setOrg(organization);
          
          if (!organization?.industry) {
            router.replace('/onboarding');
            return;
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
      <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-900">
        <div className="space-y-4 text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500">Securing your workspace...</p>
        </div>
      </div>
    );
  }

  const navItems: NavItem[] = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
        </svg>
      ),
    },
    {
      href: '/leads',
      label: 'Leads',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
    },
    {
      href: '/contacts',
      label: 'Contacts',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-7 4h10" />
        </svg>
      ),
    },
    {
      href: '/customers',
      label: 'Customers',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      href: '/deals',
      label: 'Deals',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      href: '/pipeline',
      label: 'Pipeline',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
      ),
    },
    {
      href: '/inbox',
      label: 'Inbox',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      badge: 12,
    },
    {
      href: '/tasks',
      label: 'Tasks',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      href: '/workflows',
      label: 'Workflows',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      href: '/analytics',
      label: 'Analytics',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
        </svg>
      ),
    },
    {
      href: '/reports',
      label: 'Reports',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      href: '/settings/profile',
      label: 'Settings',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      href: '/settings/team',
      label: 'Team',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      href: '/settings/billing',
      label: 'Billing',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-slate-900' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
  ];

  let isSuperAdmin = false;
  try {
    const token = getAccessToken();
    if (token) {
      const parts = token.split('.');
      if (parts.length > 1 && parts[1]) {
        const payload = JSON.parse(atob(parts[1]));
        isSuperAdmin = payload.isSuperAdmin === true;
      }
    }
  } catch (e) {
    console.error('Failed to parse token for admin check', e);
  }

  if (isSuperAdmin) {
    navItems.push({
      href: '/admin/dashboard',
      label: 'Admin',
      icon: (active) => (
        <svg className={`w-4 h-4 ${active ? 'text-purple-400' : 'text-purple-400/60'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    });
  }

  const userName = user ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Rohan Kumar';
  const orgName = org?.name || 'Acme Corp';
  const userInitials = user ? `${user.firstName[0]}${user.lastName ? user.lastName[0] : ''}`.toUpperCase() : 'RK';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar navigation */}
      <aside
        className={`fixed md:relative shrink-0 border-r border-slate-200 bg-white flex flex-col transition-all duration-300 z-50 select-none h-full ${
          mobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'
        } ${isCollapsed && !mobileMenuOpen ? 'md:w-16' : 'md:w-64'}`}
      >
        {/* Brand logo header */}
        <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <Link href="/" className="flex items-center gap-2.5 overflow-hidden group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary-600 to-primary-500 flex items-center justify-center shrink-0 shadow-sm">
              <svg className="w-4 h-4 text-slate-900 fill-current" viewBox="0 0 24 24">
                <path d="M12 2L2 22h20L12 2zm0 4l6.5 13H5.5L12 6z" />
              </svg>
            </div>
            {(!isCollapsed || mobileMenuOpen) && (
              <span className="text-base font-bold text-slate-900 tracking-wide">
                Lead<span className="text-primary-600">OS</span>
              </span>
            )}
          </Link>
          {(!isCollapsed || mobileMenuOpen) && <AppChrome />}
        </div>

        {/* Links list */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-hide">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium tracking-wide transition-all group ${
                  isActive
                    ? 'text-primary-700 bg-primary-50 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
                title={item.label}
              >
                <div className={`shrink-0 ${isActive ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-600'}`}>{item.icon(isActive)}</div>
                {(!isCollapsed || mobileMenuOpen) && <span className="flex-1">{item.label}</span>}
                {(!isCollapsed || mobileMenuOpen) && item.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600'
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
        {(!isCollapsed || mobileMenuOpen) && (
          <div className="px-4 py-3 mx-3 my-2 rounded-2xl bg-white ring-1 ring-slate-200 space-y-2.5 shrink-0 shadow-sm relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-50 to-primary-100/50 pointer-events-none" />
            <div className="space-y-1 relative z-10">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Your trial ends in</p>
              <h4 className="text-xs font-bold text-slate-900">14 days</h4>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden relative z-10 ring-1 ring-inset ring-slate-200">
              <div className="h-full rounded-full bg-primary-600 w-1/3" />
            </div>
            <Link href="/settings/billing" className="block relative z-10">
              <button className="w-full py-1.5 text-[10px] font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 ring-1 ring-primary-200 rounded-lg transition-colors shadow-sm">
                Upgrade to keep growing
              </button>
            </Link>
          </div>
        )}

        {/* Collapse sidebar button */}
        <div className="p-3 border-t border-slate-200 shrink-0 hidden md:block">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full flex items-center justify-center gap-3 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
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

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Global Header */}
        <header className="h-16 shrink-0 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 md:px-6 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 text-slate-500 hover:text-slate-900"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            {/* Global Search */}
            <div className="relative hidden sm:block group">
              <input
                type="text"
                placeholder="Search leads, deals, contacts..."
                className="w-64 pl-9 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50
                           text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white
                           focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all shadow-sm"
                readOnly
              />
              <svg className="w-4 h-4 absolute left-3 top-1.5 text-slate-400 group-focus-within:text-primary-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="absolute right-2.5 top-2 text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-500 font-mono leading-none shadow-sm">
                ⌘ K
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* User Profile */}
            <div className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-slate-50 ring-1 ring-transparent hover:ring-slate-200 transition-all cursor-pointer group">
              <div className="hidden md:block text-right">
                <h4 className="text-xs font-semibold text-slate-900 truncate leading-normal">{userName}</h4>
                <p className="text-[10px] text-slate-500 truncate leading-none">{orgName}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-xs border border-slate-200 group-hover:border-primary-200 transition-colors shadow-sm">
                {userInitials}
              </div>
              <svg className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors hidden md:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </header>

        {/* Scrollable Main Content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto p-4 md:p-6 relative">
          <BillingBanner />
          <div className="flex-1 flex flex-col min-h-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
