'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWorkflows, useDeleteWorkflow, useUpdateWorkflow, type Workflow } from '@/lib/hooks/useWorkflows';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

export default function WorkflowsPage() {
  const router = useRouter();
  const { data: workflows, isLoading, isError } = useWorkflows();
  const { mutate: deleteWorkflow } = useDeleteWorkflow();
  const { mutate: updateWorkflow } = useUpdateWorkflow('');
  const { toast } = useToast();

  const handleToggleActive = (wf: Workflow) => {
    updateWorkflow({ isActive: !wf.isActive }, {
      onSuccess: () => {
        toast(`Workflow ${wf.name} ${!wf.isActive ? 'activated' : 'deactivated'}`, 'success');
      },
      onError: (err: Error) => {
        toast(err.message || 'Failed to update workflow state', 'error');
      },
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete workflow "${name}"?`)) return;
    deleteWorkflow(id, {
      onSuccess: () => {
        toast('Workflow deleted successfully', 'success');
      },
      onError: (err: Error) => {
        toast(err.message || 'Failed to delete workflow', 'error');
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Workflows"
          description="Automate your sales workflows and notifications based on events."
        />
        <Link href="/workflows/new">
          <Button variant="primary">Create Workflow</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <div className="text-center py-12 text-red-400">
          Failed to load automation workflows. Please try again.
        </div>
      ) : !workflows || workflows.length === 0 ? (
        <EmptyState
          title="No workflows configured"
          description="Create your first automation workflow to trigger actions on lead and deal updates."
          action={{
            label: 'Create Workflow',
            onClick: () => router.push('/workflows/new'),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-slate-900 text-base">{wf.name}</h3>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
                    wf.isActive
                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                      : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}>
                    {wf.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-sm text-slate-600">{wf.description || 'No description provided'}</p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                  <span className="flex items-center gap-1">
                    <span>⚡ Trigger:</span>
                    <code className="px-1.5 py-0.5 bg-slate-50 rounded border border-slate-200">{wf.triggerType}</code>
                  </span>
                  <span>•</span>
                  <span>{wf.definition.actions.length} action(s)</span>
                  <span>•</span>
                  <span>Created {new Date(wf.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleToggleActive(wf)}
                >
                  {wf.isActive ? 'Deactivate' : 'Activate'}
                </Button>
                <Link href={`/workflows/${wf.id}/runs`}>
                  <Button variant="secondary" size="sm">History</Button>
                </Link>
                <Link href={`/workflows/${wf.id}`}>
                  <Button variant="secondary" size="sm">Edit</Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(wf.id, wf.name)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
