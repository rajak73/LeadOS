import { useId, useState, type FormEvent } from 'react';
import { Send, Sparkles } from 'lucide-react';
import {
  commentReplySchema,
  IG_COMMENT_MAX_LENGTH,
  IG_DM_MAX_LENGTH,
  type IgComment,
} from '@leados/shared';
import { useReplyToComment, useSuggestCommentReply } from '@/api/instagram';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/input';
import { formatNumber } from '@/lib/format';
import { notify } from '@/lib/toast';
import { notifyAiUnavailable } from './composer';

type Errors = { publicReply?: string; privateReply?: string; form?: string };

interface CommentReplyFormProps {
  comment: IgComment;
  /** Pre-filled text, e.g. an AI draft. */
  initial?: { publicReply: string | null; privateReply: string | null };
  submitLabel?: string;
  onDone: () => void;
  onCancel?: () => void;
}

/** Public reply and/or private message for one comment. At least one is required. */
export function CommentReplyForm({
  comment,
  initial,
  submitLabel = 'Send reply',
  onDone,
  onCancel,
}: CommentReplyFormProps) {
  const [publicReply, setPublicReply] = useState(initial?.publicReply ?? '');
  const [privateReply, setPrivateReply] = useState(
    comment.privateReplySent ? '' : (initial?.privateReply ?? ''),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [skipNote, setSkipNote] = useState<string | null>(null);
  const reply = useReplyToComment();
  const suggest = useSuggestCommentReply();
  const formErrorId = useId();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = commentReplySchema.safeParse({ publicReply, privateReply });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'publicReply' || key === 'privateReply') next[key] ??= issue.message;
        else next.form ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    reply.mutate(
      { id: comment.id, ...parsed.data },
      {
        onSuccess: () => {
          notify.success('Reply sent');
          onDone();
        },
        onError: (err) => notify.error(err, "We couldn't send the reply."),
      },
    );
  }

  function askAi() {
    suggest.mutate(comment.id, {
      onSuccess: (p) => {
        setSkipNote(p.skip ? p.skipReason || 'The AI suggests not replying to this one.' : null);
        if (p.publicReply) setPublicReply(p.publicReply);
        if (p.privateReply && !comment.privateReplySent) setPrivateReply(p.privateReply);
      },
      onError: notifyAiUnavailable,
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-describedby={errors.form ? formErrorId : undefined}
      className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3"
    >
      {skipNote && (
        <Callout tone="info" live title="The AI would skip this comment">
          {skipNote}
        </Callout>
      )}
      <FormField
        label="Public reply"
        description={`Shown under the comment for everyone to see · ${formatNumber(publicReply.trim().length)}/${formatNumber(IG_COMMENT_MAX_LENGTH)}`}
        error={errors.publicReply}
      >
        <Textarea rows={2} value={publicReply} onChange={(e) => setPublicReply(e.target.value)} />
      </FormField>
      <FormField
        label="Private message"
        description={
          comment.privateReplySent
            ? 'You’ve already sent this person a private message about this comment. Instagram allows only one.'
            : `Sent to @${comment.fromUsername ?? 'the commenter'} as a direct message · ${formatNumber(privateReply.trim().length)}/${formatNumber(IG_DM_MAX_LENGTH)}`
        }
        error={errors.privateReply}
      >
        <Textarea
          rows={2}
          value={privateReply}
          disabled={comment.privateReplySent}
          onChange={(e) => setPrivateReply(e.target.value)}
        />
      </FormField>
      <div aria-live="polite">
        {errors.form && (
          <p id={formErrorId} className="type-caption font-medium text-danger-fg">
            {errors.form}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon={<Sparkles aria-hidden />}
          loading={suggest.isPending}
          onClick={askAi}
        >
          Suggest reply
        </Button>
        <span className="ml-auto" />
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={reply.isPending}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          variant="primary"
          icon={<Send aria-hidden />}
          loading={reply.isPending}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
