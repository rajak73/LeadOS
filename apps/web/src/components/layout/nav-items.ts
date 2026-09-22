import {
  CheckSquare,
  Contact,
  KanbanSquare,
  LayoutDashboard,
  Settings,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Match nested routes (e.g. /leads/:id). */
  end?: boolean;
}

export const mainNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/contacts', label: 'Contacts', icon: Contact },
  { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/workflows', label: 'Workflows', icon: Workflow },
];

export const settingsNav: NavItem = { to: '/settings', label: 'Settings', icon: Settings };
