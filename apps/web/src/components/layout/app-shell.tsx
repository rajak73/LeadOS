import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Menu, Search, X } from 'lucide-react';
import { safeStorage } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { BrandMark, DesktopSidebar, SidebarNav } from './sidebar';
import { CommandPalette } from './command-palette';
import { NotificationsBell } from './notifications-bell';
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
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-background shadow-lg animate-slide-in-left md:hidden"
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
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Close the mobile drawer and start each page at the top on navigation.
  useEffect(() => {
    setMobileOpen(false);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    // Fixed-height shell: the sidebar never moves; only the content column scrolls.
    <div className="relative flex h-dvh overflow-hidden bg-background">
      {/* Soft brand glow at the top, matching the home page hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-accent-subtle/60 to-transparent"
      />
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <DesktopSidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} />
      <div ref={scrollRef} className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/70 bg-background/85 px-3 backdrop-blur-md sm:px-4">
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
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface px-3 type-body text-fg-subtle shadow-sm hover:border-border-strong sm:max-w-sm"
          >
            <Search aria-hidden className="size-4 shrink-0" />
            <span className="truncate">Search…</span>
            <kbd className="ml-auto hidden rounded border border-border bg-surface px-1.5 type-caption font-sans text-fg-subtle sm:inline">
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
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
