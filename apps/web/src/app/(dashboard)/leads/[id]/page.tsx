import type { Metadata } from 'next';
import { LeadDetailPage } from '@/components/leads/LeadDetailPage';

export const metadata: Metadata = { title: 'Lead Detail — LeadOS' };

export default async function LeadDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="h-full">
      <LeadDetailPage leadId={id} />
    </div>
  );
}
