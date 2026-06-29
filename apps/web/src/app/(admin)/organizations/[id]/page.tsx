import React from 'react';
import { PageHeader } from '../../../../components/ui/PageHeader';

export default function AdminOrganizationDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="p-6">
      <PageHeader title={`Organization Details`} description={`Viewing details for organization ${params.id}`} />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="p-4 border rounded-lg shadow-sm bg-white">
          <h2 className="text-lg font-medium mb-4">Actions</h2>
          <div className="flex gap-4">
            <button className="px-4 py-2 bg-yellow-500 text-white rounded">Suspend Organization</button>
            <button className="px-4 py-2 bg-red-600 text-white rounded">Delete Organization</button>
          </div>
        </div>

        <div className="p-4 border rounded-lg shadow-sm bg-white">
          <h2 className="text-lg font-medium mb-4">Usage Stats</h2>
          {/* Stats fetched from /api/v1/admin/organizations/:id/usage */}
          <ul className="space-y-2 text-sm text-gray-700">
            <li>Members: --</li>
            <li>Leads: --</li>
            <li>Deals: --</li>
            <li>Tasks: --</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
