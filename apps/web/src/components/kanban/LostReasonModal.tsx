'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useMarkLost } from '@/lib/hooks/useDealActions';
import { useToast } from '@/components/ui/Toast';

interface LostReasonModalProps {
  open: boolean;
  dealId: string | null;
  pipelineId: string | null;
  onClose: () => void;
}

export function LostReasonModal({ open, dealId, pipelineId, onClose }: LostReasonModalProps) {
  const [reason, setReason] = useState('');
  const { mutate: markLost, isPending } = useMarkLost(pipelineId);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealId) return;
    const trimmedReason = reason.trim();
    markLost(
      trimmedReason ? { dealId, reason: trimmedReason } : { dealId },
      {
        onSuccess: () => { toast('Deal marked as Lost', 'success'); onClose(); setReason(''); },
        onError: () => toast('Failed to mark deal as lost', 'error'),
      },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Mark as Lost"
      description="Optionally describe why this deal was lost."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          rows={3}
          maxLength={500}
          className="w-full px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-primary-500 resize-none"
        />
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={isPending}>
            {isPending ? 'Saving…' : 'Mark Lost'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
