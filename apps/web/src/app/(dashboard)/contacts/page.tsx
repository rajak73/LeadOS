'use client';

import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';

export default function ContactsPage() {
  return (
    <div className="space-y-6 text-slate-900 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contacts</h1>
          <p className="text-sm text-slate-600 mt-1">Manage your customer database and records.</p>
        </div>
        <Link href="/leads">
          <button className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-slate-900 rounded-lg transition-colors font-medium">
            + Add Contact
          </button>
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <EmptyState
          icon="👤"
          title="No contacts created yet"
          description="Contacts are automatically sync'd from your CRM Leads or can be imported directly."
          action={{
            label: 'Go to Leads',
            onClick: () => {
              if (typeof window !== 'undefined') window.location.href = '/leads';
            },
          }}
        />
      </div>
    </div>
  );
}
