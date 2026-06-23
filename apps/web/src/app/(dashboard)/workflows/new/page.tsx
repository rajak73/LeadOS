'use client';

import { useRouter } from 'next/navigation';
import { useCreateWorkflow } from '@/lib/hooks/useWorkflows';
import { WorkflowFormBuilder } from '@/components/workflows/WorkflowFormBuilder';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';

export default function NewWorkflowPage() {
  const router = useRouter();
  const { mutate: createWorkflow, isPending } = useCreateWorkflow();
  const { toast } = useToast();

  const handleSave = (data: Parameters<typeof createWorkflow>[0]) => {
    createWorkflow(data, {
      onSuccess: () => {
        toast('Workflow created successfully', 'success');
        router.push('/workflows');
      },
      onError: (err: Error) => {
        toast(err.message || 'Failed to create workflow', 'error');
      },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Workflow"
        description="Build a new automation trigger, condition checks, and executing actions."
      />
      <WorkflowFormBuilder
        onSave={handleSave}
        onCancel={() => router.push('/workflows')}
        isSaving={isPending}
      />
    </div>
  );
}
