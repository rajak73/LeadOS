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
      <div className="text-center py-20 text-danger-400 bg-bg-elevated border border-border rounded-2xl">
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
            👋 Welcome back, <span className="text-primary-500 font-extrabold">Rohan</span>
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
              className="w-64 pl-3 pr-8 py-1.5 text-xs rounded-lg border border-border bg-bg-base
                         text-text-primary placeholder:text-text-tertiary focus:outline-none
                         focus:border-primary-500 transition-colors"
              readOnly
            />
            <span className="absolute right-2.5 top-2 text-[10px] bg-bg-muted px-1 py-0.5 rounded text-text-tertiary font-mono">
              ⌘ K
            </span>
          </div>

          {/* Quick Filter Date Dropdown */}
          <div className="flex items-center bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-bg-subtle transition-colors">
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
        <div className="bg-bg-elevated border border-border rounded-xl p-5 space-y-4 shadow-sm flex flex-col justify-between hover:border-primary-500/30 transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">New Leads</div>
              <div className="text-3xl font-bold text-white">{totalLeads}</div>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
              <span>↑ 24.5%</span>
            </div>
          </div>
          {/* Sparkline curve */}
          <div className="h-10 w-full pt-2">
            <svg className="w-full h-full text-primary-500" viewBox="0 0 100 20" preserveAspectRatio="none">
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
        <div className="bg-bg-elevated border border-border rounded-xl p-5 space-y-4 shadow-sm flex flex-col justify-between hover:border-primary-500/30 transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Deals Won</div>
              <div className="text-3xl font-bold text-white">{wonDealsCount}</div>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
              <span>↑ 12.4%</span>
            </div>
          </div>
          {/* Sparkline curve */}
          <div className="h-10 w-full pt-2">
            <svg className="w-full h-full text-primary-500" viewBox="0 0 100 20" preserveAspectRatio="none">
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
        <div className="bg-bg-elevated border border-border rounded-xl p-5 space-y-4 shadow-sm flex flex-col justify-between hover:border-primary-500/30 transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Revenue Won</div>
              <div className="text-3xl font-bold text-white">
                ₹{((wonDealsCount * 45000) / 100000).toFixed(2)}L
              </div>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
              <span>↑ 18.6%</span>
            </div>
          </div>
          {/* Sparkline curve */}
          <div className="h-10 w-full pt-2">
            <svg className="w-full h-full text-primary-500" viewBox="0 0 100 20" preserveAspectRatio="none">
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
        <div className="bg-bg-elevated border border-border rounded-xl p-5 space-y-4 shadow-sm flex flex-col justify-between hover:border-primary-500/30 transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Pipeline Value</div>
              <div className="text-3xl font-bold text-white">
                ₹{(pipelineValue / 100000).toFixed(1)}L
              </div>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
              <span>↓ 3.2%</span>
            </div>
          </div>
          {/* Sparkline curve */}
          <div className="h-10 w-full pt-2">
            <svg className="w-full h-full text-primary-500" viewBox="0 0 100 20" preserveAspectRatio="none">
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
        <div className="bg-bg-elevated border border-border rounded-xl p-5 space-y-5 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Pipeline Overview</h3>
            <span className="text-xs text-text-tertiary">Live Breakdown</span>
          </div>

          <div className="flex flex-col items-center justify-center flex-1 py-4">
            <div className="relative w-40 h-40">
              {/* SVG Doughnut ring structure */}
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="var(--color-border-subtle)" strokeWidth="3" />
                {/* Segment 1: New - Blue */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="#3B82F6"
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
                  stroke="#06B6D4"
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
                  stroke="#8B5CF6"
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
                  stroke="#F59E0B"
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
                  stroke="#10B981"
                  strokeWidth="3.2"
                  strokeDasharray="10 90"
                  strokeDashoffset="-90"
                />
              </svg>
              {/* Inner Text overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xl font-bold text-white">₹{(pipelineValue / 100000).toFixed(1)}L</span>
                <span className="text-[9px] text-text-tertiary uppercase tracking-wider font-semibold">Total Pipeline</span>
              </div>
            </div>
          </div>

          {/* Doughnut Legend breakdown grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs border-t border-border/50 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-text-secondary">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
                <span>New</span>
              </div>
              <span className="font-semibold text-text-primary">10%</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-text-secondary">
                <span className="w-2.5 h-2.5 rounded-full bg-[#06B6D4]" />
                <span>Qualified</span>
              </div>
              <span className="font-semibold text-text-primary">25%</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-text-secondary">
                <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" />
                <span>Proposal</span>
              </div>
              <span className="font-semibold text-text-primary">35%</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-text-secondary">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                <span>Negotiation</span>
              </div>
              <span className="font-semibold text-text-primary">20%</span>
            </div>
          </div>

          <div className="text-center pt-2">
            <Link href="/pipeline" className="text-xs text-primary-500 hover:text-primary-400 font-medium hover:underline inline-flex items-center gap-1">
              View full pipeline <span>→</span>
            </Link>
          </div>
        </div>

        {/* Recent Activity List */}
        <div className="bg-bg-elevated border border-border rounded-xl p-5 space-y-4 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Recent Activity</h3>
            <Link href="/leads" className="text-xs text-primary-500 hover:underline">
              View all
            </Link>
          </div>

          <div className="space-y-4 flex-1 pt-2">
            {[
              {
                name: 'Priya Sharma',
                action: 'marked lead as',
                target: '“Hot Lead”',
                meta: 'Acme Corp',
                time: '2m ago',
                initials: 'PS',
                color: 'bg-indigo-600',
              },
              {
                name: 'Rahul Mehra',
                action: 'moved deal to',
                target: 'Proposal stage',
                meta: 'Zenith CRM Project',
                time: '15m ago',
                initials: 'RM',
                color: 'bg-emerald-600',
              },
              {
                name: 'Neha Kapoor',
                action: 'opened conversation',
                target: 'Follow-up due',
                meta: 'Email thread (3x)',
                time: '1h ago',
                initials: 'NK',
                color: 'bg-amber-600',
              },
              {
                name: 'System Hook',
                action: 'ingested lead from',
                target: '“Vikram Logistics”',
                meta: 'Website Form',
                time: '2h ago',
                initials: 'SY',
                color: 'bg-blue-600',
              },
            ].map((activity, idx) => (
              <div key={idx} className="flex gap-3 items-start text-xs border-b border-border/20 pb-3 last:border-0 last:pb-0">
                <div className={`w-8 h-8 rounded-full ${activity.color} flex items-center justify-center text-[10px] font-bold text-white`}>
                  {activity.initials}
                </div>
                <div className="flex-1 space-y-0.5">
                  <p className="text-text-secondary">
                    <span className="font-semibold text-white mr-1">{activity.name}</span>
                    {activity.action} <span className="text-primary-400 font-medium">{activity.target}</span>
                  </p>
                  <p className="text-[10px] text-text-tertiary">
                    {activity.meta} · {activity.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Insights Card */}
        <div className="bg-bg-elevated border border-border rounded-xl p-5 space-y-4 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>🤖</span> AI Insights
            </h3>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary-600/20 text-primary-400 border border-primary-600/30">
              AI Powered
            </span>
          </div>

          <div className="space-y-3 flex-1 pt-2">
            {/* Insight 1 */}
            <div className="bg-bg-base/50 border border-border/50 rounded-xl p-3 space-y-2">
              <div className="flex gap-2">
                <span className="text-green-400 mt-0.5">⚡</span>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-white">High Intent Lead Detected</h4>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    Vikram Logistics visited pricing page 3 times in last 2 days.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <Link href="/leads">
                  <Button variant="secondary" size="sm" className="text-[10px] py-1 px-2.5 h-6 rounded-md">
                    View Lead
                  </Button>
                </Link>
              </div>
            </div>

            {/* Insight 2 */}
            <div className="bg-bg-base/50 border border-border/50 rounded-xl p-3 space-y-2">
              <div className="flex gap-2">
                <span className="text-amber-400 mt-0.5">⚠️</span>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-white">Deal at Risk</h4>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    3 deals have not had any activity for 12+ days.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <Link href="/pipeline">
                  <Button variant="secondary" size="sm" className="text-[10px] py-1 px-2.5 h-6 rounded-md">
                    Review Deals
                  </Button>
                </Link>
              </div>
            </div>

            {/* Insight 3 */}
            <div className="bg-bg-base/50 border border-border/50 rounded-xl p-3 space-y-2">
              <div className="flex gap-2">
                <span className="text-primary-400 mt-0.5">📈</span>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-white">Revenue Forecast</h4>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    Predicted revenue for this month is ₹31.8L.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <Link href="/analytics">
                  <Button variant="secondary" size="sm" className="text-[10px] py-1 px-2.5 h-6 rounded-md">
                    View Forecast
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row (Revenue Trend & Tasks Due) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend Line Chart */}
        <div className="bg-bg-elevated border border-border rounded-xl p-5 space-y-4 lg:col-span-2 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Revenue Trend</h3>
              <p className="text-xs text-text-tertiary">Real-time pipeline value development</p>
            </div>
            {/* Filter Selector */}
            <div className="bg-bg-base border border-border rounded-lg px-2.5 py-1 text-xs text-text-secondary cursor-pointer flex items-center gap-1 hover:bg-bg-subtle transition-colors">
              <span>This Month</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Line Chart Grid representation using SVG */}
          <div className="h-44 w-full pt-4 relative flex flex-col justify-end">
            <svg className="w-full h-full text-primary-500 overflow-visible" viewBox="0 0 500 120">
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Horizontal grid lines */}
              <line x1="0" y1="30" x2="500" y2="30" stroke="var(--color-border-subtle)" strokeWidth="0.5" strokeDasharray="3 3" />
              <line x1="0" y1="60" x2="500" y2="60" stroke="var(--color-border-subtle)" strokeWidth="0.5" strokeDasharray="3 3" />
              <line x1="0" y1="90" x2="500" y2="90" stroke="var(--color-border-subtle)" strokeWidth="0.5" strokeDasharray="3 3" />
              
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
            <div className="flex justify-between text-[9px] text-text-tertiary pt-3 px-1">
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
        <div className="bg-bg-elevated border border-border rounded-xl p-5 space-y-4 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Tasks Due</h3>
            <Link href="/tasks" className="text-xs text-primary-500 hover:underline">
              View all
            </Link>
          </div>

          <div className="space-y-3 flex-1 pt-2">
            {tasks.map(task => (
              <div
                key={task.id}
                onClick={() => toggleTask(task.id)}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer select-none
                           ${task.completed
                             ? 'border-border/40 bg-bg-base/30 opacity-60'
                             : 'border-border bg-bg-base/70 hover:border-primary-500/30'
                           }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => {}} // toggled on container click
                    className="rounded border-border bg-bg-elevated text-primary-600 focus:ring-primary-500 focus:ring-offset-bg-elevated w-4 h-4 cursor-pointer"
                  />
                  <span className={`text-xs ${task.completed ? 'line-through text-text-tertiary' : 'text-white'}`}>
                    {task.title}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase
                                   ${task.priority === 'High' ? 'bg-red-500/15 text-red-400 border border-red-500/20' : ''}
                                   ${task.priority === 'Medium' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : ''}
                                   ${task.priority === 'Low' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20' : ''}
                                 `}>
                    {task.priority}
                  </span>
                  <span className="text-[10px] text-text-tertiary">{task.due}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer copyright section */}
      <div className="text-center text-[10px] text-text-tertiary pt-6 border-t border-border/20">
        © 2026 LeadOS. All rights reserved.
      </div>
    </div>
  );
}
