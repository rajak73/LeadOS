'use client';

import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAdminOrganizations, useSuspendOrganization, useDeleteAdminOrganization, AdminOrganization } from '@/lib/hooks/useAdmin';
import { Spinner } from '@/components/ui/Spinner';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@/lib/auth/token-store';

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useAdminOrganizations(page, 50, search);
  
  const suspendOrg = useSuspendOrganization();
  const deleteOrg = useDeleteAdminOrganization();

  useEffect(() => {
    try {
      const token = getAccessToken();
      if (token) {
        const parts = token.split('.');
        if (parts[1]) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload.isSuperAdmin === true) {
            setIsSuperAdmin(true);
            return;
          }
        }
      }
      router.replace('/dashboard');
    } catch {
      router.replace('/dashboard');
    }
  }, [router]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  if (isSuperAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-900">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 bg-slate-50 min-h-screen">
      <PageHeader title="Organizations" description="Manage organization health and high-level activity across LeadOS." />

      {data && data.items && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="text-sm font-medium text-slate-500">Total Organizations</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{data.total}</div>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="text-sm font-medium text-slate-500">Active Organizations (Page)</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{data.items.filter((org) => org.status === 'ACTIVE').length}</div>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="text-sm font-medium text-slate-500">Total Leads (Page)</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{data.items.reduce((sum, org) => sum + (org.counts?.leads || 0), 0)}</div>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="text-sm font-medium text-slate-500">Total Deals (Page)</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{data.items.reduce((sum, org) => sum + (org.counts?.deals || 0), 0)}</div>
          </div>
        </div>
      )}
      
      <div className="flex items-center gap-4">
        <input 
          type="text" 
          placeholder="Search organizations..." 
          value={search}
          onChange={handleSearch}
          className="p-2 border border-slate-200 bg-white rounded-md w-64 text-sm text-slate-900"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {isLoading && <div className="p-16 flex justify-center"><Spinner /></div>}
        {error && <div className="p-16 text-center text-red-500">Failed to load organizations.</div>}
        
        {data && data.items && data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-3 font-semibold text-slate-500">Organization</th>
                  <th className="px-5 py-3 font-semibold text-slate-500">Status</th>
                  <th className="px-5 py-3 font-semibold text-slate-500">Members</th>
                  <th className="px-5 py-3 font-semibold text-slate-500">Leads</th>
                  <th className="px-5 py-3 font-semibold text-slate-500">Customers</th>
                  <th className="px-5 py-3 font-semibold text-slate-500">Deals</th>
                  <th className="px-5 py-3 font-semibold text-slate-500">Convos</th>
                  <th className="px-5 py-3 font-semibold text-slate-500">Msgs</th>
                  <th className="px-5 py-3 font-semibold text-slate-500">Tasks</th>
                  <th className="px-5 py-3 font-semibold text-slate-500">Created</th>
                  <th className="px-5 py-3 font-semibold text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((org: AdminOrganization) => (
                  <tr key={org.id} className="border-b border-slate-200 hover:bg-slate-50/50">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{org.name}</div>
                      <div className="text-xs text-slate-500">{org.slug}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${org.status === 'ACTIVE' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {org.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{org.counts?.members || 0}</td>
                    <td className="px-5 py-3 text-slate-600">{org.counts?.leads || 0}</td>
                    <td className="px-5 py-3 text-slate-600">{org.counts?.customers || 0}</td>
                    <td className="px-5 py-3 text-slate-600">{org.counts?.deals || 0}</td>
                    <td className="px-5 py-3 text-slate-600">{org.counts?.conversations || 0}</td>
                    <td className="px-5 py-3 text-slate-600">{org.counts?.messages || 0}</td>
                    <td className="px-5 py-3 text-slate-600">{org.counts?.tasks || 0}</td>
                    <td className="px-5 py-3 text-slate-600">{new Date(org.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right space-x-3">
                    <button 
                      onClick={async () => {
                        if(confirm('Are you sure you want to toggle suspension for this org?')) {
                          await suspendOrg.mutateAsync(org.id);
                        }
                      }}
                      disabled={suspendOrg.isPending}
                      className="text-amber-500 hover:text-amber-400 text-xs font-medium"
                    >
                      {org.status === 'ACTIVE' ? 'Suspend' : 'Unsuspend'}
                    </button>
                    <button 
                      onClick={async () => {
                        if(confirm('Are you absolutely sure you want to DELETE this organization? This is irreversible.')) {
                          await deleteOrg.mutateAsync(org.id);
                        }
                      }}
                      disabled={deleteOrg.isPending}
                      className="text-red-500 hover:text-red-400 text-xs font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {data && data.items && data.items.length === 0 && (
          <div className="p-16 text-center text-slate-500">No organizations found.</div>
        )}
      </div>
    </div>
  );
}
