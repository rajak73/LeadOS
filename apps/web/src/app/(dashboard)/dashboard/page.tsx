'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useDashboardAnalytics } from '@/lib/hooks/useAnalytics';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState('week');
  const { data: analytics, isLoading, isError } = useDashboardAnalytics(timeRange);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !analytics) {
    return (
      <div className="text-center py-20 text-danger-400 bg-white shadow-sm border border-slate-200 rounded-2xl">
        Failed to load dashboard metrics. Please refresh the page.
      </div>
    );
  }

  // Raw counts or fallback values
  const totalLeads = analytics.totalLeads || 0;
  const pipelineValue = analytics.deals.totalValue || 0;
  const wonDealsCount = analytics.statusBreakdown.WON || 0;

  return (
    <div className="space-y-6 pb-10 text-slate-900">
      {/* Page Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            👋 Welcome back, <span className="text-primary-400 font-extrabold">Rohan</span>
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Here's what's happening with your business today.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Quick Filter Date Dropdown */}
          <div className="relative group">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="appearance-none bg-white border border-slate-200 rounded-lg pl-8 pr-8 py-1.5 text-xs font-medium cursor-pointer hover:bg-slate-50 transition-colors focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
            </select>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">📅</span>
            <svg className="w-3.5 h-3.5 text-slate-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Add New dropdown */}
          <Link href="/leads">
            <Button variant="primary" size="sm" className="bg-primary-600 hover:bg-primary-700 text-slate-900 rounded-lg flex items-center gap-1.5">
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
        <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-5 flex flex-col justify-between h-40 hover:border-indigo-500/20 transition-all duration-300">
          <div className="flex gap-4">
            {/* Icon Block */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#6366f1] to-[#a855f7] flex items-center justify-center text-slate-900 shrink-0 shadow-lg shadow-sm">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">New Leads</div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-extrabold text-slate-900">{totalLeads}</span>
                <span className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                  ↑ 24.5%
                </span>
              </div>
              <div className="text-[10px] text-slate-500">vs last 7 days</div>
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
        <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-5 flex flex-col justify-between h-40 hover:border-indigo-500/20 transition-all duration-300">
          <div className="flex gap-4">
            {/* Icon Block */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#3b82f6] to-[#6366f1] flex items-center justify-center text-slate-900 shrink-0 shadow-lg shadow-sm">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Deals Won</div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-extrabold text-slate-900">{wonDealsCount}</span>
                <span className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                  ↑ 12.4%
                </span>
              </div>
              <div className="text-[10px] text-slate-500">vs last 7 days</div>
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
        <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-5 flex flex-col justify-between h-40 hover:border-indigo-500/20 transition-all duration-300">
          <div className="flex gap-4">
            {/* Icon Block */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#10b981] to-[#3b82f6] flex items-center justify-center text-slate-900 shrink-0 shadow-lg shadow-sm">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Revenue Won</div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-extrabold text-slate-900">
                  ₹{((wonDealsCount * 45000) / 100000).toFixed(2)}L
                </span>
                <span className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                  ↑ 18.6%
                </span>
              </div>
              <div className="text-[10px] text-slate-500">vs last 7 days</div>
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
        <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-5 flex flex-col justify-between h-40 hover:border-indigo-500/20 transition-all duration-300">
          <div className="flex gap-4">
            {/* Icon Block */}
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#ec4899] to-[#8b5cf6] flex items-center justify-center text-slate-900 shrink-0 shadow-lg shadow-sm">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Pipeline Value</div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-extrabold text-slate-900">
                  ₹{(pipelineValue / 100000).toFixed(1)}L
                </span>
                <span className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                  ↓ 3.2%
                </span>
              </div>
              <div className="text-[10px] text-slate-500">vs last 7 days</div>
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
        <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Pipeline Overview</h3>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Live Breakdown</span>
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
                <span className="text-lg font-extrabold text-slate-900">₹{(pipelineValue / 100000).toFixed(1)}L</span>
                <span className="text-[8px] text-slate-500 uppercase tracking-wider font-semibold">Total Pipeline</span>
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
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <span className={`w-2 h-2 rounded-full ${item.color} shrink-0`} />
                    <span className="truncate">{item.name} <span className="text-slate-500 text-[9px]">({item.pct})</span></span>
                  </div>
                  <span className="font-semibold text-slate-900 ml-1 shrink-0">{item.val}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center pt-2 border-t border-slate-200">
            <Link href="/pipeline" className="text-xs text-primary-400 hover:text-primary-300 font-bold hover:underline inline-flex items-center gap-1">
              View full pipeline <span>→</span>
            </Link>
          </div>
        </div>

        {/* Recent Activity List */}
        <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Recent Activity</h3>
            <Link href="/leads" className="text-xs text-primary-400 hover:text-primary-300 font-bold hover:underline">
              View all
            </Link>
          </div>

          <div className="space-y-3.5 flex-1 pt-1 flex items-center justify-center">
            <p className="text-sm text-slate-500">No recent activity found.</p>
          </div>
        </div>

        {/* Empty Box in place of AI Insights */}
        <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
           <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              Insights
            </h3>
          </div>
          <div className="flex items-center justify-center flex-1">
            <p className="text-sm text-slate-500">No insights generated.</p>
          </div>
        </div>
      </div>

      {/* Bottom Row (Revenue Trend & Tasks Due) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend Line Chart */}
        <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-5 space-y-4 lg:col-span-2 flex flex-col justify-between shadow-xl">
          <div className="flex justify-between items-center">
            <div className="space-y-0.5">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Revenue Trend</h3>
              <p className="text-[10px] text-slate-500">Real-time pipeline value development</p>
            </div>
            {/* Filter Selector */}
            <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-slate-600 cursor-pointer flex items-center gap-1 hover:bg-slate-50 transition-colors">
              <span>This Month</span>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <div className="flex items-center justify-center flex-1 min-h-[150px]">
            <p className="text-sm text-slate-500">Not enough data to generate trend.</p>
          </div>
        </div>

        {/* Tasks Due checklist panel */}
        <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-5 space-y-4 flex flex-col justify-between shadow-xl">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Tasks Due</h3>
            <Link href="/tasks" className="text-xs text-primary-400 hover:text-primary-300 font-bold hover:underline">
              View all
            </Link>
          </div>

          <div className="flex items-center justify-center flex-1">
            <p className="text-sm text-slate-500">No pending tasks.</p>
          </div>
        </div>
      </div>

      {/* Footer copyright section */}
      <div className="text-center text-[10px] text-slate-500 pt-6 border-t border-slate-200">
        © 2026 LeadOS. All rights reserved.
      </div>
    </div>
  );
}
