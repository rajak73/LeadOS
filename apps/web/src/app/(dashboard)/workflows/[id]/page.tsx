'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkflow, useUpdateWorkflow } from '@/lib/hooks/useWorkflows';
import { WorkflowFormBuilder } from '@/components/workflows/WorkflowFormBuilder';
import { PageHeader } from '@/components/ui/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

interface EditWorkflowPageProps {
  params: Promise<{ id: string }>;
}

export default function EditWorkflowPage({ params }: EditWorkflowPageProps) {
  const router = useRouter();
  const { id } = use(params);
  const { data: workflow, isLoading, isError } = useWorkflow(id);
  const { mutate: updateWorkflow, isPending } = useUpdateWorkflow(id);
  const { toast } = useToast();

  const handleSave = (data: Parameters<typeof updateWorkflow>[0]) => {
    updateWorkflow(data, {
      onSuccess: () => {
        toast('Workflow updated successfully', 'success');
        router.push('/workflows');
      },
      onError: (err: Error) => {
        toast(err.message || 'Failed to update workflow', 'error');
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !workflow) {
    return (
      <div className="text-center py-12 text-red-400">
        Failed to load workflow details. It may have been deleted.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit Workflow: ${workflow.name}`}
        description="Modify triggers, execution rules, or active action setups."
      />
      <WorkflowFormBuilder
        initialData={workflow}
        onSave={handleSave}
        onCancel={() => router.push('/workflows')}
        isSaving={isPending}
      />
    </div>
  );
}
