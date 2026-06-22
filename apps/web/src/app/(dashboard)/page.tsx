'use client';

import Link from 'next/link';
import { useLeads } from '@/lib/hooks/useLeads';
import { useConversations } from '@/lib/hooks/useConversations';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';

const QUICK_ACTIONS = [
  { href: '/leads', icon: '👤', label: 'View Leads' },
  { href: '/pipeline', icon: '🔀', label: 'Pipeline' },
  { href: '/inbox', icon: '💬', label: 'Inbox' },
  { href: '/notifications', icon: '🔔', label: 'Notifications' },
];

export default function DashboardPage() {
  const { data: leadsData, isLoading: leadsLoading } = useLeads({ limit: 1, page: 1 });
  const { data: convsData, isLoading: convsLoading } = useConversations({});

  const leadsTotal = leadsData?.meta?.total;
  const openConvs = convsData?.pages?.[0]?.items?.length;

  return (
    <div className="space-y-6 max-w-screen-lg">
      <PageHeader
        title="Dashboard"
        description="Welcome back — here's what's happening in your workspace."
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon="👤"
          label="Total Leads"
          value={leadsLoading ? <Spinner size="sm" /> : (leadsTotal ?? '—')}
        />
        <StatCard
          icon="💬"
          label="Open Conversations"
          value={convsLoading ? <Spinner size="sm" /> : (openConvs != null ? `${openConvs}+` : '—')}
          subtext="first page"
        />
        <StatCard icon="🔀" label="Pipelines" value="—" subtext="open deals" />
        <StatCard icon="✅" label="Tasks due today" value="—" subtext="coming in M4" />
      </div>

      {/* Quick actions */}
      <div className="bg-bg-elevated border border-border rounded-xl p-5 space-y-4">
        <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Quick actions</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(({ href, icon, label }) => (
            <Link key={href} href={href}>
              <Button variant="secondary" size="sm">
                <span aria-hidden="true">{icon}</span>
                {label}
              </Button>
            </Link>
          ))}
        </div>
      </div>

      {/* What's next */}
      <div className="bg-bg-elevated border border-border rounded-xl p-5 space-y-3">
        <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Roadmap</p>
        <ul className="space-y-2">
          {[
            { done: true, label: 'Notification Engine (M1)' },
            { done: false, label: 'AI Lead Scoring (M2)' },
            { done: false, label: 'Workflow Automation (M3)' },
            { done: false, label: 'Smart Follow-ups (M4)' },
          ].map(({ done, label }) => (
            <li key={label} className="flex items-center gap-2 text-sm">
              <span className={done ? 'text-green-400' : 'text-text-tertiary'} aria-hidden="true">
                {done ? '✓' : '○'}
              </span>
              <span className={done ? 'text-text-secondary' : 'text-text-tertiary'}>{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
