'use client';

import { use } from 'react';
import Link from 'next/link';
import { useWorkflow, useWorkflowRuns } from '@/lib/hooks/useWorkflows';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { formatRelativeTime } from '@/lib/types/api';

interface WorkflowRunsPageProps {
  params: Promise<{ id: string }>;
}

export default function WorkflowRunsPage({ params }: WorkflowRunsPageProps) {
  const { id } = use(params);
  const { data: workflow, isLoading: isWfLoading } = useWorkflow(id);
  const { data: runs, isLoading: isRunsLoading, isError, refetch } = useWorkflowRuns(id);

  const isLoading = isWfLoading || isRunsLoading;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'COMPLETED':
        return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'FAILED':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'SKIPPED':
      default:
        return 'bg-bg-subtle text-text-tertiary border-border';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={workflow ? `Run History: ${workflow.name}` : 'Workflow Run History'}
          description="View recent automated executions, execution states, and audit trails."
        />
        <div className="flex gap-2">
          <Link href="/workflows">
            <Button variant="secondary">Back to Workflows</Button>
          </Link>
          <Button variant="secondary" onClick={() => void refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <div className="text-center py-12 text-red-400">
          Failed to load run history log.
        </div>
      ) : !runs || runs.length === 0 ? (
        <div className="text-center py-16 bg-bg-elevated border border-border rounded-xl">
          <p className="text-sm text-text-secondary font-medium">No runs recorded yet</p>
          <p className="text-xs text-text-tertiary mt-1">
            This workflow will register run entries here as soon as its trigger event fires.
          </p>
        </div>
      ) : (
        <div className="bg-bg-elevated border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-bg-subtle/50 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  <th className="p-4">Run ID / Time</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Depth</th>
                  <th className="p-4">Actions Log</th>
                  <th className="p-4">Error details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-sm">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-bg-base/40 transition-colors">
                    <td className="p-4 space-y-0.5">
                      <div className="font-mono text-xs text-text-secondary">{run.id}</div>
                      <div className="text-xs text-text-tertiary">
                        {formatRelativeTime(run.createdAt)}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${getStatusBadge(run.status)}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="p-4 text-xs font-medium text-text-secondary">
                      {run.depth} / 10
                    </td>
                    <td className="p-4 space-y-1.5 max-w-sm">
                      {run.actionLogs && run.actionLogs.length > 0 ? (
                        run.actionLogs.map((log, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-xs">
                            <span className={log.success ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                              {log.success ? '✓' : '✗'}
                            </span>
                            <span className="font-mono text-text-secondary">{log.action}:</span>
                            <span className="text-text-tertiary truncate">
                              {log.success ? 'Success' : log.error || 'Failed'}
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-text-tertiary italic">No actions executed</span>
                      )}
                    </td>
                    <td className="p-4 text-xs text-red-400 max-w-xs break-words">
                      {run.error || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
