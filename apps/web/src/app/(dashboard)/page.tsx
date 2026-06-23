'use client';

import Link from 'next/link';
import { useDashboardAnalytics } from '@/lib/hooks/useAnalytics';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';

const QUICK_ACTIONS = [
  { href: '/leads', icon: '👤', label: 'View Leads' },
  { href: '/pipeline', icon: '📊', label: 'Pipeline' },
  { href: '/inbox', icon: '💬', label: 'Inbox' },
  { href: '/workflows', icon: '⚡', label: 'Workflows' },
  { href: '/tasks', icon: '✅', label: 'Tasks' },
];

export default function DashboardPage() {
  const { data: analytics, isLoading, isError } = useDashboardAnalytics();

  // Extract SVG graph points for Lead Growth
  const growthData = analytics?.leadsGrowth || [];
  const maxCount = Math.max(...growthData.map((d) => d.count), 1);
  const chartHeight = 120;
  const chartWidth = 500;

  const points = growthData
    .map((d, i) => {
      const x = growthData.length > 1 ? (i / (growthData.length - 1)) * chartWidth : 0;
      const y = chartHeight - (d.count / maxCount) * chartHeight;
      return `${x},${y}`;
    })
    .join(' ');

  const areaPoints = growthData.length > 0
    ? `0,${chartHeight} ${points} ${chartWidth},${chartHeight}`
    : '';

  return (
    <div className="space-y-8 max-w-screen-lg">
      <PageHeader
        title="Dashboard"
        description="Welcome back — here's a real-time summary of your workspace."
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : isError || !analytics ? (
        <div className="text-center py-12 text-red-400">
          Failed to load dashboard metrics.
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon="👥"
              label="Total Leads"
              value={analytics.totalLeads}
            />
            <StatCard
              icon="🤝"
              label="Active Deals"
              value={analytics.deals.count}
            />
            <StatCard
              icon="💰"
              label="Pipeline Value"
              value={`₹${analytics.deals.totalValue.toLocaleString()}`}
            />
            <StatCard
              icon="🎯"
              label="Qualified Leads"
              value={analytics.statusBreakdown.QUALIFIED}
              subtext="leads marked qualified"
            />
          </div>

          {/* Premium Chart Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Conversion Funnel */}
            <div className="bg-bg-elevated border border-border rounded-xl p-5 space-y-4 shadow-sm">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
                Leads Conversion Funnel
              </h3>
              <div className="space-y-3 pt-2">
                {[
                  { label: 'New', count: analytics.statusBreakdown.NEW, color: 'bg-blue-500/20 text-blue-400' },
                  { label: 'Contacted', count: analytics.statusBreakdown.CONTACTED, color: 'bg-yellow-500/20 text-yellow-400' },
                  { label: 'Qualified', count: analytics.statusBreakdown.QUALIFIED, color: 'bg-purple-500/20 text-purple-400' },
                  { label: 'Won', count: analytics.statusBreakdown.WON, color: 'bg-green-500/20 text-green-400' },
                  { label: 'Lost', count: analytics.statusBreakdown.LOST, color: 'bg-red-500/20 text-red-400' },
                ].map((item) => {
                  const percent = analytics.totalLeads > 0 ? (item.count / analytics.totalLeads) * 100 : 0;
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-text-secondary">{item.label}</span>
                        <span className="text-text-primary font-semibold">
                          {item.count} ({percent.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 w-full bg-bg-base rounded-full overflow-hidden border border-border/30">
                        <div
                          className={`h-full ${item.color.split(' ')[0]} transition-all duration-500`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Lead Growth Timeline */}
            <div className="bg-bg-elevated border border-border rounded-xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
                Lead Growth (Last 30 Days)
              </h3>
              {growthData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs text-text-tertiary italic">
                  No historical data available.
                </div>
              ) : (
                <div className="pt-4 flex-1 flex flex-col justify-end">
                  <svg
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    className="w-full h-32 text-primary-500 overflow-visible"
                  >
                    <defs>
                      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    {/* Grid line */}
                    <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="var(--color-border-default)" strokeWidth="1" />
                    {/* Area path */}
                    {areaPoints && (
                      <polygon points={areaPoints} fill="url(#chartGrad)" />
                    )}
                    {/* Line path */}
                    {points && (
                      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" />
                    )}
                  </svg>
                  <div className="flex justify-between text-[10px] text-text-tertiary pt-2">
                    <span>{growthData[0]?.date}</span>
                    <span>{growthData[growthData.length - 1]?.date}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-bg-elevated border border-border rounded-xl p-5 space-y-4 shadow-sm">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Quick Actions</p>
            <div className="flex flex-wrap gap-2.5">
              {QUICK_ACTIONS.map(({ href, icon, label }) => (
                <Link key={href} href={href}>
                  <Button variant="secondary" size="sm" className="hover:border-primary-500/50">
                    <span aria-hidden="true">{icon}</span>
                    {label}
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
