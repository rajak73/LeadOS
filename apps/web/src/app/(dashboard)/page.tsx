'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useDashboardAnalytics } from '@/lib/hooks/useAnalytics';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';

// Mock list of tasks for the Tasks Due list
interface LocalTask {
  id: string;
  title: string;
  priority: 'High' | 'Medium' | 'Low';
  due: string;
  completed: boolean;
}

export default function DashboardPage() {
  const { data: analytics, isLoading, isError } = useDashboardAnalytics();
  const [tasks, setTasks] = useState<LocalTask[]>([
    { id: '1', title: 'Follow up with Acme Corp', priority: 'High', due: 'Today', completed: false },
    { id: '2', title: 'Prepare proposal for Zenith Solutions', priority: 'Medium', due: 'Tomorrow', completed: false },
    { id: '3', title: 'Call Vikram Logistics', priority: 'High', due: 'May 8', completed: false },
    { id: '4', title: 'Demo for Globex Corporation', priority: 'Low', due: 'May 9', completed: false },
  ]);

  const toggleTask = (id: string) => {
    setTasks(prev =>
      prev.map(t => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !analytics) {
    return (
      <div className="text-center py-20 text-danger-400 bg-[#0e0e18]/90 border border-white/5 rounded-2xl">
        Failed to load dashboard metrics. Please refresh the page.
      </div>
    );
  }

  // Raw counts or fallback values
  const totalLeads = analytics.totalLeads || 0;
  const pipelineValue = analytics.deals.totalValue || 0;
  const wonDealsCount = analytics.statusBreakdown.WON || 0;

  return (
    <div className="space-y-6 pb-10 text-text-primary">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            👋 Welcome back, <span className="text-primary-400 font-extrabold">Rohan</span>
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Here's what's happening with your business today.
          </p>
        </div>

        {/* Global Search & Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Mock search input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search leads, deals, contacts..."
              className="w-64 pl-3 pr-8 py-1.5 text-xs rounded-lg border border-border bg-[#0e0e18]
                         text-text-primary placeholder:text-text-tertiary focus:outline-none
                         focus:border-primary-500 transition-colors"
              readOnly
            />
            <span className="absolute right-2.5 top-2 text-[10px] bg-[#1a1a2e] px-1 py-0.5 rounded text-text-tertiary font-mono">
              ⌘ K
            </span>
          </div>

          {/* Quick Filter Date Dropdown */}
          <div className="flex items-center bg-[#0e0e18] border border-border rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-[#1a1a2e] transition-colors">
            <span>📅 This Week</span>
            <svg className="w-3.5 h-3.5 ml-1 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Add New dropdown */}
          <Link href="/leads">
            <Button variant="primary" size="sm" className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg flex items-center gap-1.5">
              <span>+ Add New</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid (KPI strip with Sparklines) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: New Leads */}
        <div className="bg-[#0e0e18]/90 border border-white/5 rounded-2xl p-5 flex flex-col justify-between h-40 hover:border-indigo-500/20 transition-all duration-300">
          <div className="flex gap-4">
            {/* Icon Block */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#6366f1] to-[#a855f7] flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-500/10">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">New Leads</div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-extrabold text-white">{totalLeads}</span>
                <span className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                  ↑ 24.5%
                </span>
              </div>
              <div className="text-[10px] text-text-tertiary">vs last 7 days</div>
            </div>
          </div>
          {/* Sparkline curve */}
          <div className="h-8 w-full pt-1">
            <svg className="w-full h-full text-indigo-500" viewBox="0 0 100 20" preserveAspectRatio="none">
              <path
                d="M0,15 Q15,18 30,12 T60,5 T90,10 T100,2"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* KPI 2: Deals Won */}
        <div className="bg-[#0e0e18]/90 border border-white/5 rounded-2xl p-5 flex flex-col justify-between h-40 hover:border-indigo-500/20 transition-all duration-300">
          <div className="flex gap-4">
            {/* Icon Block */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#3b82f6] to-[#6366f1] flex items-center justify-center text-white shrink-0 shadow-lg shadow-blue-500/10">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Deals Won</div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-extrabold text-white">{wonDealsCount}</span>
                <span className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                  ↑ 12.4%
                </span>
              </div>
              <div className="text-[10px] text-text-tertiary">vs last 7 days</div>
            </div>
          </div>
          {/* Sparkline curve */}
          <div className="h-8 w-full pt-1">
            <svg className="w-full h-full text-blue-500" viewBox="0 0 100 20" preserveAspectRatio="none">
              <path
                d="M0,10 Q20,15 40,8 T80,12 T100,5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* KPI 3: Revenue Won */}
        <div className="bg-[#0e0e18]/90 border border-white/5 rounded-2xl p-5 flex flex-col justify-between h-40 hover:border-indigo-500/20 transition-all duration-300">
          <div className="flex gap-4">
            {/* Icon Block */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#10b981] to-[#3b82f6] flex items-center justify-center text-white shrink-0 shadow-lg shadow-emerald-500/10">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Revenue Won</div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-extrabold text-white">
                  ₹{((wonDealsCount * 45000) / 100000).toFixed(2)}L
                </span>
                <span className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                  ↑ 18.6%
                </span>
              </div>
              <div className="text-[10px] text-text-tertiary">vs last 7 days</div>
            </div>
          </div>
          {/* Sparkline curve */}
          <div className="h-8 w-full pt-1">
            <svg className="w-full h-full text-emerald-500" viewBox="0 0 100 20" preserveAspectRatio="none">
              <path
                d="M0,18 Q30,10 60,15 T100,2"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* KPI 4: Pipeline Value */}
        <div className="bg-[#0e0e18]/90 border border-white/5 rounded-2xl p-5 flex flex-col justify-between h-40 hover:border-indigo-500/20 transition-all duration-300">
          <div className="flex gap-4">
            {/* Icon Block */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#ec4899] to-[#8b5cf6] flex items-center justify-center text-white shrink-0 shadow-lg shadow-pink-500/10">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Pipeline Value</div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-extrabold text-white">
                  ₹{(pipelineValue / 100000).toFixed(1)}L
                </span>
                <span className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                  ↓ 3.2%
                </span>
              </div>
              <div className="text-[10px] text-text-tertiary">vs last 7 days</div>
            </div>
          </div>
          {/* Sparkline curve */}
          <div className="h-8 w-full pt-1">
            <svg className="w-full h-full text-pink-500" viewBox="0 0 100 20" preserveAspectRatio="none">
              <path
                d="M0,5 Q20,15 40,3 T80,18 T100,10"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Middle Row (Overview, Activity, AI Insights) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Doughnut Chart */}
        <div className="bg-[#0e0e18]/90 border border-white/5 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Pipeline Overview</h3>
            <span className="text-[10px] text-text-tertiary uppercase tracking-widest font-bold">Live Breakdown</span>
          </div>

          {/* Horizontal side-by-side donut + legend layout */}
          <div className="flex flex-row items-center justify-between gap-4 py-2 flex-1">
            {/* Left side: Donut circle */}
            <div className="relative w-32 h-32 shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="3.2" />
                {/* Segment 1: New - Blue */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="#3b82f6"
                  strokeWidth="3.2"
                  strokeDasharray="10 90"
                  strokeDashoffset="0"
                />
                {/* Segment 2: Qualified - Cyan */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="#06b6d4"
                  strokeWidth="3.2"
                  strokeDasharray="25 75"
                  strokeDashoffset="-10"
                />
                {/* Segment 3: Proposal - Purple */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="#8b5cf6"
                  strokeWidth="3.2"
                  strokeDasharray="35 65"
                  strokeDashoffset="-35"
                />
                {/* Segment 4: Negotiation - Yellow */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="#f59e0b"
                  strokeWidth="3.2"
                  strokeDasharray="20 80"
                  strokeDashoffset="-70"
                />
                {/* Segment 5: Won - Green */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="#10b981"
                  strokeWidth="3.2"
                  strokeDasharray="10 90"
                  strokeDashoffset="-90"
                />
              </svg>
              {/* Inner Text overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-lg font-extrabold text-white">₹{(pipelineValue / 100000).toFixed(1)}L</span>
                <span className="text-[8px] text-text-tertiary uppercase tracking-wider font-semibold">Total Pipeline</span>
              </div>
            </div>

            {/* Right side: Legend */}
            <div className="flex-1 space-y-1.5 pl-2">
              {[
                { name: 'New', color: 'bg-[#3b82f6]', pct: '10%', val: '₹2.46L' },
                { name: 'Qualified', color: 'bg-[#06b6d4]', pct: '25%', val: '₹6.15L' },
                { name: 'Proposal', color: 'bg-[#8b5cf6]', pct: '35%', val: '₹8.61L' },
                { name: 'Negotiation', color: 'bg-[#f59e0b]', pct: '20%', val: '₹4.92L' },
                { name: 'Won', color: 'bg-[#10b981]', pct: '10%', val: '₹2.46L' },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-[10px] leading-tight">
                  <div className="flex items-center gap-1.5 text-text-secondary">
                    <span className={`w-2 h-2 rounded-full ${item.color} shrink-0`} />
                    <span className="truncate">{item.name} <span className="text-text-tertiary text-[9px]">({item.pct})</span></span>
                  </div>
                  <span className="font-semibold text-text-primary ml-1 shrink-0">{item.val}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center pt-2 border-t border-white/5">
            <Link href="/pipeline" className="text-xs text-primary-400 hover:text-primary-300 font-bold hover:underline inline-flex items-center gap-1">
              View full pipeline <span>→</span>
            </Link>
          </div>
        </div>

        {/* Recent Activity List */}
        <div className="bg-[#0e0e18]/90 border border-white/5 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Recent Activity</h3>
            <Link href="/leads" className="text-xs text-primary-400 hover:text-primary-300 font-bold hover:underline">
              View all
            </Link>
          </div>

          <div className="space-y-3.5 flex-1 pt-1">
            {[
              {
                name: 'Priya Sharma',
                action: 'marked as',
                target: '“Hot Lead”',
                meta: 'Acme Corp',
                time: '2m ago',
                initials: 'PS',
                grad: 'from-pink-500 to-indigo-500',
              },
              {
                name: 'Rahul Mehra',
                action: 'moved deal to',
                target: 'Proposal stage',
                meta: 'Zenith CRM Project',
                time: '15m ago',
                initials: 'RM',
                grad: 'from-blue-500 to-emerald-500',
              },
              {
                name: 'Neha Kapoor',
                action: 'opened conversation',
                target: 'Follow-up due',
                meta: 'Email thread (3x)',
                time: '1h ago',
                initials: 'NK',
                grad: 'from-orange-500 to-purple-500',
              },
              {
                name: 'System Integration',
                action: 'ingested lead from',
                target: '“Vikram Logistics”',
                meta: 'Website API Connection',
                time: '2h ago',
                initials: 'VL',
                grad: 'from-indigo-600 to-blue-500',
                isGlobe: true,
              },
              {
                name: 'Rohan Kumar',
                action: 'completed call with',
                target: 'Zenith Solutions',
                meta: 'Next Actions Scheduled',
                time: '3h ago',
                initials: 'RK',
                grad: 'from-violet-500 to-pink-500',
              },
            ].map((activity, idx) => (
              <div key={idx} className="flex gap-3 items-center text-xs border-b border-white/5 pb-2.5 last:border-0 last:pb-0">
                {activity.isGlobe ? (
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                  </div>
                ) : (
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${activity.grad} flex items-center justify-center text-[10px] font-extrabold text-white shrink-0`}>
                    {activity.initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-text-secondary text-[11px] truncate leading-tight">
                    <span className="font-bold text-white mr-1">{activity.name}</span>
                    {activity.action} <span className="text-primary-400 font-semibold">{activity.target}</span>
                  </p>
                  <p className="text-[9px] text-text-tertiary">
                    {activity.meta} · {activity.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Insights Card */}
        <div className="bg-[#0e0e18]/90 border border-white/5 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>🤖</span> AI Insights
            </h3>
            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-primary-600/10 text-primary-400 border border-primary-600/20">
              AI
            </span>
          </div>

          <div className="space-y-2.5 flex-1 pt-1">
            {/* Insight 1 */}
            <div className="bg-[#121222]/50 border border-green-500/10 hover:border-green-500/20 rounded-xl p-3 flex items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-lg">⚡</span>
                <div className="space-y-0.5 min-w-0">
                  <h4 className="text-[11px] font-bold text-white leading-tight">High Intent Lead Detected</h4>
                  <p className="text-[9px] text-text-secondary leading-normal truncate max-w-[140px]">
                    Vikram Logistics visited pricing page 3 times.
                  </p>
                </div>
              </div>
              <Link href="/leads" className="shrink-0">
                <Button variant="secondary" className="text-[9px] py-1 px-2.5 h-6 rounded-md bg-[#1d1d36] hover:bg-[#252545] border-white/5 text-white">
                  View Lead
                </Button>
              </Link>
            </div>

            {/* Insight 2 */}
            <div className="bg-[#121222]/50 border border-yellow-500/10 hover:border-yellow-500/20 rounded-xl p-3 flex items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-3">
                <span className="text-yellow-400 text-lg">⚠️</span>
                <div className="space-y-0.5 min-w-0">
                  <h4 className="text-[11px] font-bold text-white leading-tight">Deal at Risk</h4>
                  <p className="text-[9px] text-text-secondary leading-normal truncate max-w-[140px]">
                    3 deals have not had active communication.
                  </p>
                </div>
              </div>
              <Link href="/pipeline" className="shrink-0">
                <Button variant="secondary" className="text-[9px] py-1 px-2.5 h-6 rounded-md bg-[#1d1d36] hover:bg-[#252545] border-white/5 text-white">
                  Review Deals
                </Button>
              </Link>
            </div>

            {/* Insight 3 */}
            <div className="bg-[#121222]/50 border border-purple-500/10 hover:border-purple-500/20 rounded-xl p-3 flex items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-3">
                <span className="text-purple-400 text-lg">📈</span>
                <div className="space-y-0.5 min-w-0">
                  <h4 className="text-[11px] font-bold text-white leading-tight">Revenue Forecast</h4>
                  <p className="text-[9px] text-text-secondary leading-normal truncate max-w-[140px]">
                    Predicted monthly value is ₹31.8L.
                  </p>
                </div>
              </div>
              <Link href="/analytics" className="shrink-0">
                <Button variant="secondary" className="text-[9px] py-1 px-2.5 h-6 rounded-md bg-[#1d1d36] hover:bg-[#252545] border-white/5 text-white">
                  View Forecast
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row (Revenue Trend & Tasks Due) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend Line Chart */}
        <div className="bg-[#0e0e18]/90 border border-white/5 rounded-2xl p-5 space-y-4 lg:col-span-2 flex flex-col justify-between shadow-xl">
          <div className="flex justify-between items-center">
            <div className="space-y-0.5">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Revenue Trend</h3>
              <p className="text-[10px] text-text-tertiary">Real-time pipeline value development</p>
            </div>
            {/* Filter Selector */}
            <div className="bg-[#0e0e18] border border-white/5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-text-secondary cursor-pointer flex items-center gap-1 hover:bg-[#1a1a2e] transition-colors">
              <span>This Month</span>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Line Chart Grid representation using SVG */}
          <div className="h-44 w-full pt-4 relative flex flex-col justify-end">
            <svg className="w-full h-full text-indigo-500 overflow-visible" viewBox="0 0 500 120">
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Horizontal grid lines */}
              <line x1="0" y1="30" x2="500" y2="30" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="0" y1="60" x2="500" y2="60" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="0" y1="90" x2="500" y2="90" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3 3" />
              
              {/* Area under curve */}
              <polygon
                points="0,120 0,110 50,105 100,95 150,88 200,92 250,75 300,82 350,55 400,68 450,42 500,30 500,120"
                fill="url(#revenueGrad)"
              />
              
              {/* Line path */}
              <polyline
                points="0,110 50,105 100,95 150,88 200,92 250,75 300,82 350,55 400,68 450,42 500,30"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Dynamic data dot anchors */}
              <circle cx="350" cy="55" r="4.5" fill="#FFF" stroke="currentColor" strokeWidth="2.5" />
              <circle cx="500" cy="30" r="4.5" fill="#FFF" stroke="currentColor" strokeWidth="2.5" />
            </svg>

            {/* X Axis Labels */}
            <div className="flex justify-between text-[9px] font-bold text-text-tertiary pt-3 px-1">
              <span>Apr 1</span>
              <span>Apr 8</span>
              <span>Apr 15</span>
              <span>Apr 22</span>
              <span>Apr 29</span>
              <span>May 6</span>
            </div>
          </div>
        </div>

        {/* Tasks Due checklist panel */}
        <div className="bg-[#0e0e18]/90 border border-white/5 rounded-2xl p-5 space-y-4 flex flex-col justify-between shadow-xl">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Tasks Due</h3>
            <Link href="/tasks" className="text-xs text-primary-400 hover:text-primary-300 font-bold hover:underline">
              View all
            </Link>
          </div>

          <div className="space-y-2.5 flex-1 pt-1">
            {tasks.map(task => (
              <div
                key={task.id}
                onClick={() => toggleTask(task.id)}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none
                           ${task.completed
                             ? 'border-white/5 bg-[#121222]/30 opacity-55'
                             : 'border-white/5 bg-[#121222]/70 hover:border-indigo-500/20'
                           }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => {}} // toggled on container click
                    className="rounded border-white/10 bg-[#0e0e18] text-primary-600 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                  />
                  <span className={`text-[11px] font-medium ${task.completed ? 'line-through text-text-tertiary' : 'text-white'}`}>
                    {task.title}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase
                                   ${task.priority === 'High' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : ''}
                                   ${task.priority === 'Medium' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : ''}
                                   ${task.priority === 'Low' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : ''}
                                 `}>
                    {task.priority}
                  </span>
                  <span className={`text-[9px] font-bold ${task.due === 'Today' ? 'text-red-400 font-extrabold' : 'text-text-tertiary'}`}>{task.due}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer copyright section */}
      <div className="text-center text-[10px] text-text-tertiary pt-6 border-t border-white/5">
        © 2026 LeadOS. All rights reserved.
      </div>
    </div>
  );
}
