import { Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Menu, Search, X } from 'lucide-react';
import { safeStorage } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { BrandMark, DesktopSidebar, SidebarNav } from './sidebar';
import { CommandPalette } from './command-palette';
import { NotificationsBell } from './notifications-bell';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

const COLLAPSE_KEY = 'leados-sidebar-collapsed';
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function MobileNav({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in md:hidden" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface shadow-lg animate-slide-in-left md:hidden"
        >
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <div className="flex items-center justify-between pr-2">
            <BrandMark />
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                iconOnly
                aria-label="Close navigation"
                icon={<X aria-hidden />}
              />
            </DialogPrimitive.Close>
          </div>
          <SidebarNav onNavigate={() => onOpenChange(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PageFallback() {
  return (
    <div className="flex justify-center py-24 text-fg-muted">
      <Spinner className="size-5" label="Loading page…" />
    </div>
  );
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => safeStorage.get(COLLAPSE_KEY) === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      safeStorage.set(COLLAPSE_KEY, c ? '0' : '1');
      return !c;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close the mobile drawer on navigation.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <DesktopSidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/85 px-3 backdrop-blur sm:px-4">
          <Button
            variant="ghost"
            iconOnly
            aria-label="Open navigation"
            className="md:hidden"
            icon={<Menu aria-hidden />}
            onClick={() => setMobileOpen(true)}
          />
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 type-body text-fg-subtle hover:border-border-strong sm:max-w-sm"
          >
            <Search aria-hidden className="size-4 shrink-0" />
            <span className="truncate">Search…</span>
            <kbd className="ml-auto hidden rounded border border-border bg-surface px-1.5 type-caption font-sans text-fg-subtle sm:inline">
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationsBell />
            <UserMenu />
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8"
        >
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
