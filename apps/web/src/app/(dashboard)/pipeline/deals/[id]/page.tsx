import { DealDetailPage } from '@/components/deals/DealDetailPage';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DealDetailRoute({ params }: Props) {
  const { id } = await params;
  return (
    <div className="h-full">
      <DealDetailPage dealId={id} />
    </div>
  );
}
