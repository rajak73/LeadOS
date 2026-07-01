'use client';

import React, { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAdminOrganizations, useSuspendOrganization, useDeleteAdminOrganization, AdminOrganization } from '@/lib/hooks/useAdmin';
import { Spinner } from '@/components/ui/Spinner';

export default function AdminOrganizationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useAdminOrganizations(page, 50, search);
  
  const suspendOrg = useSuspendOrganization();
  const deleteOrg = useDeleteAdminOrganization();

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader title="Platform Organizations" description="Manage all tenant organizations." />
      
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
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-3 font-semibold text-slate-500">Organization</th>
                <th className="px-5 py-3 font-semibold text-slate-500">Industry</th>
                <th className="px-5 py-3 font-semibold text-slate-500">Status</th>
                <th className="px-5 py-3 font-semibold text-slate-500">Users</th>
                <th className="px-5 py-3 font-semibold text-slate-500">Leads</th>
                <th className="px-5 py-3 font-semibold text-slate-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((org: AdminOrganization) => (
                <tr key={org.id} className="border-b border-slate-200 hover:bg-slate-50/30">
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900">{org.name}</div>
                    <div className="text-xs text-slate-500">{org.slug}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{org.industry || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${org.status === 'ACTIVE' ? 'bg-green-500/15 text-green-400 border-green-500/20' : 'bg-red-500/15 text-red-400 border-red-500/20'}`}>
                      {org.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{org._count?.users || 0}</td>
                  <td className="px-5 py-3 text-slate-600">{org._count?.leads || 0}</td>
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
        )}

        {data && data.items && data.items.length === 0 && (
          <div className="p-16 text-center text-slate-500">No organizations found.</div>
        )}
      </div>
    </div>
  );
}
