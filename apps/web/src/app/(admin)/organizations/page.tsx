'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface Organization {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  createdAt: string;
  updatedAt: string;
}

type ApiError = Error & {
  response?: {
    data?: {
      error?: {
        message?: string;
      };
    };
  };
};

export default function AdminOrganizationsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; org: Organization | null }>({ isOpen: false, org: null });

  const { data: orgs, isLoading, isError, error } = useQuery({
    queryKey: ['admin_organizations'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/organizations');
      return res.data.data.items as Organization[];
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.put(`/admin/organizations/${id}/suspend`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_organizations'] });
      toast('Organization status updated successfully.', 'success');
      setConfirmModal({ isOpen: false, org: null });
    },
    onError: (err: ApiError) => {
      const msg = err?.response?.data?.error?.message || 'Failed to update organization status.';
      toast(msg, 'error');
      setConfirmModal({ isOpen: false, org: null });
    },
  });

  const handleActionClick = (org: Organization) => {
    setConfirmModal({ isOpen: true, org });
  };

  const confirmAction = () => {
    if (confirmModal.org) {
      toggleStatusMutation.mutate(confirmModal.org.id);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader title="Organizations" description="Manage all tenant organizations across the platform." />
      
      <div className="rounded-2xl border border-border bg-bg-elevated overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : isError ? (
           <div className="flex flex-col items-center justify-center py-16 text-center">
             <p className="text-red-400 mb-2 font-medium">Error loading organizations.</p>
             <p className="text-sm text-text-tertiary">{(error as ApiError)?.response?.data?.error?.message || 'Unauthorized or server error.'}</p>
           </div>
        ) : orgs && orgs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-base">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Domain/Slug</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Plan</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Members</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Leads</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Revenue</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Created</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => (
                  <tr key={org.id} className="border-b border-border/50 hover:bg-bg-subtle/30 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-white">{org.name}</td>
                    <td className="px-5 py-3.5 text-text-secondary">{org.slug}</td>
                    <td className="px-5 py-3.5">
                      {org.status === 'ACTIVE' ? (
                        <Badge variant="won">Active</Badge>
                      ) : org.status === 'SUSPENDED' ? (
                        <Badge variant="lost">Suspended</Badge>
                      ) : (
                        <Badge variant="default">{org.status}</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-text-tertiary italic">Not available</td>
                    <td className="px-5 py-3.5 text-text-tertiary italic">Not available</td>
                    <td className="px-5 py-3.5 text-text-tertiary italic">Not available</td>
                    <td className="px-5 py-3.5 text-text-tertiary italic">Not available</td>
                    <td className="px-5 py-3.5 text-text-secondary text-xs">
                      {new Date(org.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Button
                        variant={org.status === 'ACTIVE' ? 'danger' : 'primary'}
                        size="sm"
                        onClick={() => handleActionClick(org)}
                        disabled={toggleStatusMutation.isPending}
                      >
                        {org.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center text-text-tertiary text-sm">No organizations found.</div>
        )}
      </div>

      <Modal
        open={confirmModal.isOpen}
        onOpenChange={(open) => setConfirmModal(prev => ({ ...prev, isOpen: open }))}
        title={confirmModal.org?.status === 'ACTIVE' ? 'Suspend Organization' : 'Reactivate Organization'}
        description={confirmModal.org?.status === 'ACTIVE' ? `Are you sure you want to suspend ${confirmModal.org?.name}? Users will immediately lose access.` : `Are you sure you want to reactivate ${confirmModal.org?.name}?`}
      >
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={() => setConfirmModal({ isOpen: false, org: null })}>
            Cancel
          </Button>
          <Button
            variant={confirmModal.org?.status === 'ACTIVE' ? 'danger' : 'primary'}
            onClick={confirmAction}
            disabled={toggleStatusMutation.isPending}
          >
            {toggleStatusMutation.isPending ? 'Processing...' : 'Confirm'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
