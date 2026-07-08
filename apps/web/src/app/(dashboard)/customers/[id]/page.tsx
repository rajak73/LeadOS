import type { Metadata } from 'next';
import { Customer360View } from '@/components/customers/Customer360View';

export const metadata: Metadata = { title: 'Customer 360 — LeadOS' };

export default async function Customer360Route({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="h-full">
      <Customer360View customerId={id} />
    </div>
  );
}
