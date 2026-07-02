'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useLeadScore, useRescoreLead } from '@/lib/hooks/useLeadScore';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatRelativeTime } from '@/lib/types/api';

interface LeadScorePopoverProps {
  leadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadScorePopover({ leadId, open, onOpenChange }: LeadScorePopoverProps) {
  const { data, isLoading, isError, refetch } = useLeadScore(leadId);
  const { mutate: rescore, isPending: isRescoring } = useRescoreLead(leadId);
  const { toast } = useToast();

  const handleRecalculate = () => {
    rescore(undefined, {
      onSuccess: () => {
        toast('AI rescoring request enqueued', 'success');
        // Let's refetch score details after a brief delay
        setTimeout(() => {
          void refetch();
        }, 1500);
      },
      onError: (err: Error) => {
        toast(err.message || 'Failed to request rescoring', 'error');
      },
    });
  };

  const score = data?.score ?? null;
  const factors = data?.factors ?? [];
  const recommendation = data?.recommendation ?? null;
  const history = data?.history ?? [];
  const updatedAt = data?.aiScoreUpdatedAt ?? null;

  const positives = factors.filter((f) => f.type === 'POSITIVE');
  const negatives = factors.filter((f) => f.type === 'NEGATIVE');

  let scoreColorClass = 'text-slate-600 border-slate-200 bg-white';
  if (score !== null) {
    if (score >= 70) {
      scoreColorClass = 'text-green-400 border-green-500/30 bg-green-500/10';
    } else if (score >= 40) {
      scoreColorClass = 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
    } else {
      scoreColorClass = 'text-red-400 border-red-500/30 bg-red-500/10';
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6 shadow-2xl focus:outline-none max-h-[85vh] overflow-y-auto">
          <Dialog.Title className="text-lg font-semibold text-slate-900 mb-4 flex items-center justify-between">
            <span>AI Lead Score Details</span>
            {isRescoring && <Spinner size="sm" />}
          </Dialog.Title>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : isError ? (
            <div className="text-center py-6 text-red-400 text-sm">
              Failed to load AI scoring information.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Score Header */}
              <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center border-2 text-2xl font-bold ${scoreColorClass}`}>
                  {score !== null ? score : '—'}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {score !== null ? (score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cold') : 'Unscored Lead'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {updatedAt ? `Last analyzed ${formatRelativeTime(updatedAt)}` : 'Never analyzed by AI'}
                  </p>
                </div>
              </div>

              {/* Recommendation */}
              {recommendation && (
                <div className="p-4 rounded-xl border border-primary-500/20 bg-primary-500/5">
                  <h4 className="text-xs font-semibold text-primary-400 uppercase tracking-wider mb-1">AI Recommendation</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">{recommendation}</p>
                </div>
              )}

              {/* Factors */}
              {factors.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Positives */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-green-400 uppercase tracking-wider">Positive Factors</h4>
                    {positives.length === 0 ? (
                      <p className="text-xs text-slate-500">None identified</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {positives.map((f, i) => (
                          <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                            <span className="text-green-400 mt-0.5 font-bold">✓</span>
                            <span>{f.description}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Negatives */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">Negative Factors</h4>
                    {negatives.length === 0 ? (
                      <p className="text-xs text-slate-500">None identified</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {negatives.map((f, i) => (
                          <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                            <span className="text-red-400 mt-0.5 font-bold">✗</span>
                            <span>{f.description}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {/* Scoring History */}
              {history.length > 1 && (
                <div className="border-t border-slate-200 pt-4 space-y-2">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Scoring History</h4>
                  <div className="space-y-2 max-h-28 overflow-y-auto pr-1">
                    {history.map((h) => (
                      <div key={h.id} className="flex justify-between items-center text-xs p-1.5 hover:bg-slate-50/40 rounded transition-colors">
                        <span className="text-slate-600 font-medium">Score: {h.score}</span>
                        <span className="text-slate-500">{formatRelativeTime(h.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <Button variant="secondary" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  onClick={handleRecalculate}
                  disabled={isRescoring}
                  data-testid="btn-recalculate-score"
                >
                  {isRescoring ? 'Enqueuing…' : 'Recalculate Score'}
                </Button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
