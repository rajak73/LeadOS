'use client';

import React from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import Link from 'next/link';

export default function AdminDashboardPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader title="Super Admin Dashboard" description="Platform overview and quick links." />
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/admin/organizations" className="p-6 border border-slate-200 bg-white rounded-2xl hover:border-primary-500 transition-colors group">
          <h3 className="text-lg font-semibold text-slate-900 group-hover:text-primary-400">Organizations</h3>
          <p className="text-sm text-slate-500 mt-2">Manage all tenant organizations across the platform.</p>
        </Link>

        <Link href="/admin/users" className="p-6 border border-slate-200 bg-white rounded-2xl hover:border-primary-500 transition-colors group">
          <h3 className="text-lg font-semibold text-slate-900 group-hover:text-primary-400">Platform Users</h3>
          <p className="text-sm text-slate-500 mt-2">View and manage global user accounts.</p>
        </Link>
      </div>
    </div>
  );
}
