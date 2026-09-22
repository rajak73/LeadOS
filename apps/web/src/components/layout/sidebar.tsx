import { NavLink } from 'react-router';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Tooltip } from '@/components/ui/tooltip';
import { useSettings } from '@/api/account';
import { mainNav, settingsNav, type NavItem } from './nav-items';

export function BrandMark({ collapsed }: { collapsed?: boolean }) {
  const { data: settings } = useSettings();
  return (
    <div className="flex h-14 items-center gap-2.5 px-3">
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary type-small font-bold text-primary-fg"
      >
        L
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate type-body font-semibold text-fg">
            {settings?.companyName || 'LeadOS'}
          </span>
        </span>
      )}
    </div>
  );
}

function NavEntry({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'flex h-9 items-center gap-3 rounded-md px-2.5 type-body font-medium transition-colors',
          isActive
            ? 'bg-primary-subtle text-primary-subtle-fg'
            : 'text-fg-muted hover:bg-muted hover:text-fg',
          collapsed && 'justify-center px-0',
        )
      }
    >
      <item.icon aria-hidden className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

interface SidebarNavProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

/** Navigation list shared by the desktop sidebar and the mobile drawer. NavLink sets aria-current. */
export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-2 py-2">
      {mainNav.map((item) => (
        <NavEntry key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
      <div className="mt-auto pt-2">
        <NavEntry item={settingsNav} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}

export function DesktopSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 md:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <BrandMark collapsed={collapsed} />
      <SidebarNav collapsed={collapsed} />
      <div className={cn('border-t border-border p-2', collapsed && 'flex justify-center')}>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className={cn(
            'flex h-9 items-center gap-3 rounded-md px-2.5 type-small text-fg-muted hover:bg-muted hover:text-fg',
            collapsed ? 'w-9 justify-center px-0' : 'w-full',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden className="size-4" />
          ) : (
            <PanelLeftClose aria-hidden className="size-4" />
          )}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  );
}
