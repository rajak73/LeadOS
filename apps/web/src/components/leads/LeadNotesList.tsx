'use client';

import { useState } from 'react';
import { useLeadNotes, useCreateLeadNote } from '@/lib/hooks/useLeadNotes';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { formatRelativeTime, getNoteText } from '@/lib/types/api';

interface LeadNotesListProps {
  leadId: string;
}

export function LeadNotesList({ leadId }: LeadNotesListProps) {
  const { data, isLoading } = useLeadNotes(leadId);
  const { mutate: createNote, isPending: saving } = useCreateLeadNote(leadId);
  const [draftContent, setDraftContent] = useState('');

  const handleCreate = () => {
    const text = draftContent.trim();
    if (!text) return;
    createNote({ text }, {
      onSuccess: () => setDraftContent(''),
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  const notes = data?.data ?? [];

  return (
    <div className="space-y-4" data-testid="lead-notes-list">
      {/* Create note */}
      <div className="space-y-2">
        <textarea
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          placeholder="Add a note…"
          rows={3}
          data-testid="note-textarea"
          className="w-full px-3 py-2 text-sm bg-bg-base border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary-500 resize-none transition-colors"
        />
        <Button
          variant="primary"
          onClick={handleCreate}
          disabled={!draftContent.trim() || saving}
          data-testid="btn-add-note"
        >
          {saving ? 'Saving…' : 'Add Note'}
        </Button>
      </div>

      {notes.length === 0 && (
        <p className="text-sm text-text-tertiary text-center py-4">No notes yet</p>
      )}

      {notes.map((note) => (
        <div
          key={note.id}
          className="p-3 bg-bg-elevated border border-border rounded-lg space-y-1"
          data-testid={`note-${note.id}`}
        >
          <p className="text-sm text-text-primary whitespace-pre-wrap">{getNoteText(note.content)}</p>
          <p className="text-xs text-text-tertiary">{formatRelativeTime(note.createdAt)}</p>
        </div>
      ))}
    </div>
  );
}
