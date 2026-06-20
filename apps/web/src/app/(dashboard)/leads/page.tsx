import type { Metadata } from 'next';
import { LeadListPage } from '@/components/leads/LeadListPage';

export const metadata: Metadata = { title: 'Leads — LeadOS' };

export default function LeadsPage() {
  return (
    <div className="h-full">
      <LeadListPage />
    </div>
  );
}
