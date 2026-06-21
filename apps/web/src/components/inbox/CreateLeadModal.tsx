'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useCreateLeadFromConversation } from '@/lib/hooks/useCreateLeadFromConversation';
import type { Conversation } from '@/lib/types/api';

interface CreateLeadModalProps {
  conversation: Conversation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateLeadModal({ conversation, open, onOpenChange }: CreateLeadModalProps) {
  const { toast } = useToast();
  const { mutate, isPending } = useCreateLeadFromConversation();

  // Parse customer IG user ID from igConversationId: format "${recipientId}_${senderId}"
  const parts = conversation.igConversationId.split('_');
  const customerIgUserId = parts.slice(1).join('_');
  // Show enriched handle if available, fall back to IG user ID
  const igDisplayValue = conversation.lead?.instagramHandle ?? customerIgUserId;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setFirstName('');
    setLastName('');
    setError(null);
    onOpenChange(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) {
      setError('First name is required');
      return;
    }
    setError(null);
    mutate(
      {
        conversationId: conversation.id,
        firstName: firstName.trim(),
        ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast('Lead created successfully', 'success');
          handleClose();
        },
        onError: (err) => {
          if (err.message === 'CONFLICT') {
            toast('A lead for this conversation already exists', 'error');
          } else {
            toast('Failed to create lead', 'error');
          }
        },
      },
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Create Lead"
      description="Convert this Instagram conversation into a lead"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
        {/* IG identifier — read-only, pre-filled (R-2: may be user ID until enrichment runs) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Instagram User ID / Handle</label>
          <input
            type="text"
            value={igDisplayValue}
            readOnly
            className="w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-text-primary opacity-60 cursor-not-allowed"
          />
        </div>

        {/* First name — required (R-3 correction) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">
            First Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Enter first name"
            autoFocus
            className="w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Last name — optional */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Last Name</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Enter last name (optional)"
            className="w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={isPending || !firstName.trim()}>
            {isPending ? 'Creating…' : 'Create Lead'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
