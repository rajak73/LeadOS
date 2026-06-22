import { KanbanBoardLoader } from '@/components/kanban/KanbanBoardLoader';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata = { title: 'Pipeline — LeadOS' };

export default function PipelinePage() {
  return (
    <div className="flex flex-col h-full gap-4">
      <PageHeader title="Pipeline" />
      <div className="flex-1 min-h-0">
        <KanbanBoardLoader />
      </div>
    </div>
  );
}
