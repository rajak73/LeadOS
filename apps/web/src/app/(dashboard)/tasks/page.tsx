'use client';

import { useState } from 'react';
import { useTasks, useUpdateTask, useFollowupSuggestion, type Task } from '@/lib/hooks/useTasks';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatRelativeTime } from '@/lib/types/api';

export default function TasksPage() {
  const { data: tasks, isLoading, isError, refetch } = useTasks();
  const { mutate: updateTask, isPending: isUpdating } = useUpdateTask();
  const { toast } = useToast();

  // Suggestion Modal state
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [suggestionOpen, setSuggestionOpen] = useState(false);

  // Hook for AI Suggestion
  const { data: suggestion, isLoading: isSuggestionLoading } = useFollowupSuggestion(
    selectedLeadId || '',
    suggestionOpen && !!selectedLeadId
  );

  const handleComplete = (task: Task) => {
    updateTask(
      {
        id: task.id,
        data: { status: 'COMPLETED' },
      },
      {
        onSuccess: () => {
          toast('Task marked as completed', 'success');
          void refetch();
        },
        onError: (err: Error) => {
          toast(err.message || 'Failed to complete task', 'error');
        },
      }
    );
  };

  const handleSnooze = (task: Task, days: number) => {
    const newDueDate = new Date();
    newDueDate.setDate(newDueDate.getDate() + days);

    updateTask(
      {
        id: task.id,
        data: { dueDate: newDueDate.toISOString() },
      },
      {
        onSuccess: () => {
          toast(`Task snoozed by ${days} days`, 'success');
          void refetch();
        },
        onError: (err: Error) => {
          toast(err.message || 'Failed to snooze task', 'error');
        },
      }
    );
  };

  const handleGetSuggestion = (leadId: string) => {
    setSelectedLeadId(leadId);
    setSuggestionOpen(true);
  };

  const handleCopySuggestion = () => {
    if (suggestion?.draft) {
      void navigator.clipboard.writeText(suggestion.draft);
      toast('Copied to clipboard!', 'success');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return 'text-red-400 bg-red-500/10 border-red-500/25';
      case 'HIGH':
        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25';
      case 'MEDIUM':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/25';
      case 'LOW':
      default:
        return 'text-text-tertiary bg-bg-subtle border-border';
    }
  };

  const pendingTasks = (tasks || []).filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Tasks & Follow-ups"
          description="Manage pending follow-up suggestions and CRM actions."
        />
        <Button variant="secondary" onClick={() => void refetch()} disabled={isLoading}>
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <div className="text-center py-12 text-red-400">
          Failed to load tasks.
        </div>
      ) : pendingTasks.length === 0 ? (
        <EmptyState
          title="All caught up!"
          description="You have no outstanding tasks or follow-ups to process."
        />
      ) : (
        <div className="space-y-4">
          {pendingTasks.map((task) => (
            <div
              key={task.id}
              className="bg-bg-elevated border border-border rounded-xl p-5 hover:border-border-strong transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-text-primary text-base">{task.title}</h3>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${getPriorityColor(task.priority)}`}>
                    {task.priority}
                  </span>
                  {task.type === 'FOLLOW_UP' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border bg-primary-500/15 text-primary-400 border-primary-500/20">
                      Smart Follow-up
                    </span>
                  )}
                </div>
                {task.description && (
                  <p className="text-sm text-text-secondary leading-relaxed">{task.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                  {task.dueDate && (
                    <span>
                      📅 Due: {new Date(task.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  <span>•</span>
                  <span>Created {formatRelativeTime(task.createdAt)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {task.type === 'FOLLOW_UP' && task.relatedLeadId && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleGetSuggestion(task.relatedLeadId!)}
                  >
                    💡 AI Draft
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleComplete(task)}
                  disabled={isUpdating}
                >
                  ✓ Complete
                </Button>
                <div className="relative group">
                  <Button variant="secondary" size="sm">
                    🕒 Snooze ▾
                  </Button>
                  <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block hover:block z-50 bg-bg-elevated border border-border rounded-lg shadow-xl py-1 min-w-[120px]">
                    <button
                      type="button"
                      onClick={() => handleSnooze(task, 1)}
                      className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-bg-subtle"
                    >
                      1 Day
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSnooze(task, 3)}
                      className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-bg-subtle"
                    >
                      3 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSnooze(task, 7)}
                      className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-bg-subtle"
                    >
                      1 Week
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Suggestion Dialog Modal */}
      {suggestionOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-bg-elevated border border-border rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-border/50 pb-3">
              <h3 className="text-lg font-semibold text-text-primary">AI Follow-up Suggestion</h3>
              <button
                onClick={() => setSuggestionOpen(false)}
                className="text-text-secondary hover:text-text-primary text-xl"
              >
                ✕
              </button>
            </div>

            {isSuggestionLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size="lg" />
              </div>
            ) : !suggestion ? (
              <p className="text-sm text-red-400 text-center py-6">
                Failed to generate AI follow-up suggestion.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-bg-base border border-border rounded-lg text-xs space-y-1">
                  <div className="font-semibold text-text-secondary">
                    Recommended Channel: <span className="text-primary-400 font-bold">{suggestion.channel}</span>
                  </div>
                </div>
                <div className="p-4 bg-bg-base border border-border rounded-lg text-sm text-text-primary font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                  {suggestion.draft}
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="secondary" onClick={() => setSuggestionOpen(false)}>
                    Close
                  </Button>
                  <Button variant="primary" onClick={handleCopySuggestion}>
                    📋 Copy Text
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
