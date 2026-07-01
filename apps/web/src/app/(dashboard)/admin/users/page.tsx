'use client';

import React from 'react';
import { PageHeader } from '@/components/ui/PageHeader';

export default function AdminUsersPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader title="Platform Users" description="Manage all global user accounts." />
      
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden p-16 text-center">
        <p className="text-3xl mb-3">🚧</p>
        <p className="text-slate-500 text-sm">Global User Management API is under construction.</p>
        <p className="text-slate-500 text-xs mt-2">Currently available via database queries or tenant-specific team management.</p>
      </div>
    </div>
  );
}
