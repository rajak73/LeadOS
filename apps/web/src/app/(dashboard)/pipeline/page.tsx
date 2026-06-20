import { KanbanBoardLoader } from '@/components/kanban/KanbanBoardLoader';

export const metadata = { title: 'Pipeline — LeadOS' };

export default function PipelinePage() {
  return (
    <div className="h-full">
      <KanbanBoardLoader />
    </div>
  );
}
