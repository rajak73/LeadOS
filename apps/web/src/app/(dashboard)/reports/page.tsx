'use client';

import Link from 'next/link';

export default function ReportsPage() {
  return (
    <div className="space-y-6 text-slate-900 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports</h1>
          <p className="text-sm text-slate-600 mt-1">Export activity history, audit logs, and analytics metrics.</p>
        </div>
        <Link href="/analytics">
          <button className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-slate-900 rounded-lg transition-colors font-medium">
            View Analytics
          </button>
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
        <div className="w-12 h-12 bg-primary-500/10 border border-primary-500/20 rounded-full flex items-center justify-center mx-auto text-xl">
          📊
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900">Custom Reporting Sheets</h3>
          <p className="text-xs text-slate-600 max-w-sm mx-auto">
            Design and download reports for leads conversion, pipeline transitions, and agent workload distributions.
          </p>
        </div>
        <div>
          <Link href="/analytics">
            <button className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-50 text-slate-900 transition-colors">
              Go to Analytics
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
