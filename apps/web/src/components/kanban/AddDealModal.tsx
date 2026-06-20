'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useCreateDeal } from '@/lib/hooks/useDealActions';
import { useToast } from '@/components/ui/Toast';

interface AddDealModalProps {
  open: boolean;
  onClose: () => void;
  pipelineId: string;
  stageId: string;
}

export function AddDealModal({ open, onClose, pipelineId, stageId }: AddDealModalProps) {
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const { mutate: createDeal, isPending } = useCreateDeal(pipelineId);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createDeal(
      { title: title.trim(), pipelineId, stageId, value: value ? Number(value) : undefined },
      {
        onSuccess: () => { toast('Deal created', 'success'); onClose(); setTitle(''); setValue(''); },
        onError: () => toast('Failed to create deal', 'error'),
      },
    );
  };

  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) onClose(); }} title="Add Deal">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-xs text-text-secondary block mb-1">Title *</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Deal title"
            className="w-full px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500"
          />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">Value (INR)</label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-1.5 text-sm bg-bg-base border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary-500"
          />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={isPending || !title.trim()}>
            {isPending ? 'Creating…' : 'Create Deal'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
