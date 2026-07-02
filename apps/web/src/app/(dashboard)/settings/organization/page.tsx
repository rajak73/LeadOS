'use client';

import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { useOrganization, useUpdateOrganization, useDeleteOrganization } from '@/lib/hooks/useOrganization';
import { Button } from '@/components/ui/Button';

export default function OrganizationSettingsPage() {
  const { data: org, isLoading } = useOrganization();
  const updateOrg = useUpdateOrganization();
  const deleteOrg = useDeleteOrganization();

  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  useEffect(() => {
    if (org) {
      setName(org.name || '');
      setIndustry(org.industry || '');
    }
  }, [org]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await updateOrg.mutateAsync({ name, industry });
      setSuccess('Organization updated successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update organization');
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you absolutely sure you want to delete this organization? This is irreversible.')) {
      try {
        await deleteOrg.mutateAsync();
        window.location.href = '/login';
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to delete organization');
      }
    }
  };

  if (isLoading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader title="Organization Settings" description="Update your organization details and settings." />
      
      <div className="mt-6 p-6 border rounded-lg shadow-sm bg-white">
        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-md text-sm">{error}</div>}
        {success && <div className="mb-4 p-3 bg-green-50 text-green-600 rounded-md text-sm">{success}</div>}
        
        <form className="space-y-4" onSubmit={handleUpdate}>
          <div>
            <label className="block text-sm font-medium text-gray-700">Organization Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm text-black" 
              placeholder="Acme Corp" 
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Industry</label>
            <input 
              type="text" 
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm text-black" 
              placeholder="Software" 
            />
          </div>
          <Button type="submit" disabled={updateOrg.isPending}>
            {updateOrg.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>

        <div className="mt-10 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-medium text-red-600">Danger Zone</h3>
          <p className="text-sm text-gray-500 mb-4">Deleting your organization is irreversible and will remove all associated data immediately.</p>
          <Button variant="danger" onClick={handleDelete} disabled={deleteOrg.isPending}>
            {deleteOrg.isPending ? 'Deleting...' : 'Delete Organization'}
          </Button>
        </div>
      </div>
    </div>
  );
}
