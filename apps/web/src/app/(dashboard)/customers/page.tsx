'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Spinner } from '@/components/ui/Spinner';
import { PageHeader } from '@/components/ui/PageHeader';
import Link from 'next/link';

interface CustomerListResponse {
  data: {
    id: string;
    type: string;
    name: string;
    email: string;
    phone: string;
    company: string | null;
    avatarUrl: string | null;
    updatedAt: string;
    score: number | null;
  }[];
}

export default function CustomersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await apiClient.get<CustomerListResponse>('/customers');
      return res.data.data;
    },
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto h-full p-4">
      <PageHeader title="Customer 360" description="Unified view of your entire audience, from Leads to Contacts." />
      
      <div className="rounded-2xl border border-border bg-bg-elevated overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : data && data.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-base">
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Type</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Score</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.map((customer) => (
                <tr key={customer.id} className="border-b border-border/50 hover:bg-bg-subtle/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <Link href={`/customers/${customer.id}`} className="font-medium text-primary-400 hover:underline">
                      {customer.name || 'Unnamed Customer'}
                    </Link>
                    <div className="text-xs text-text-tertiary mt-1">{customer.email || customer.phone || 'No contact info'}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${customer.type === 'CONTACT' ? 'bg-green-500/15 text-green-400 border-green-500/20' : 'bg-blue-500/15 text-blue-400 border-blue-500/20'}`}>
                      {customer.type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {customer.score !== null ? (
                      <span className={`font-semibold ${customer.score >= 80 ? 'text-green-400' : customer.score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{customer.score}</span>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-text-tertiary text-xs">
                    {new Date(customer.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-16 text-center text-text-tertiary text-sm">No customers found.</div>
        )}
      </div>
    </div>
  );
}
