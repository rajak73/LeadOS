import { useState } from 'react';
import { Link } from 'react-router';
import {
  AlertCircle,
  CornerDownRight,
  Lock,
  MessageSquareReply,
  SkipForward,
  UserRound,
} from 'lucide-react';
import type { IgComment } from '@leados/shared';
import { useSkipComment } from '@/api/instagram';
import { RelativeTime } from '@/components/domain/relative-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { personName } from '@/lib/format';
import { commentReplyStatusLabels, commentReplyStatusTones } from '@/lib/labels';
import { notify } from '@/lib/toast';
import { CommentReplyForm } from './comment-reply-form';

function SentReply({
  icon: Icon,
  label,
  text,
}: {
  icon: typeof Lock;
  label: string;
  text: string;
}) {
  return (
    <div className="flex gap-2 rounded-md bg-muted px-3 py-2">
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" />
      <p className="min-w-0 type-small text-fg">
        <span className="font-medium text-fg-muted">{label}: </span>
        {text}
      </p>
    </div>
  );
}

/** One comment with its status, what was sent, and reply / draft actions. */
export function CommentItem({ comment: c }: { comment: IgComment }) {
  const isDraft = c.replyStatus === 'DRAFT';
  const [replying, setReplying] = useState(false);
  const skip = useSkipComment();
  const who = c.fromUsername ? `@${c.fromUsername}` : 'Someone';
  const answered = c.replyStatus === 'REPLIED';
  const doSkip = () =>
    skip.mutate(c.id, {
      onSuccess: () => notify.info('Comment skipped'),
      onError: (e) => notify.error(e, "We couldn't skip the comment."),
    });

  return (
    <article className="flex flex-col gap-2 px-4 py-3" aria-label={`Comment from ${who}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="type-body font-semibold text-fg">{who}</span>
        <RelativeTime date={c.commentedAt} className="type-caption text-fg-subtle" />
        <Badge tone={commentReplyStatusTones[c.replyStatus]} className="ml-auto">
          {commentReplyStatusLabels[c.replyStatus]}
        </Badge>
      </div>
      <p className="type-body break-words whitespace-pre-wrap text-fg">{c.text}</p>
      {c.lead && (
        <Link
          to={`/leads/${c.lead.id}`}
          className="inline-flex items-center gap-1 self-start type-small font-medium text-primary-text hover:underline"
        >
          <UserRound aria-hidden className="size-3.5" />
          <span className="sr-only">Lead: </span>
          {personName(c.lead)}
        </Link>
      )}

      {answered && c.publicReply && (
        <SentReply icon={CornerDownRight} label="Public reply" text={c.publicReply} />
      )}
      {answered && c.privateReply && (
        <SentReply icon={Lock} label="Private message" text={c.privateReply} />
      )}
      {c.replyStatus === 'SKIPPED' && c.skipReason && (
        <p className="type-small text-fg-muted">Skipped: {c.skipReason}</p>
      )}
      {c.replyStatus === 'FAILED' && (
        <p className="flex items-center gap-1 type-small font-medium text-danger-fg">
          <AlertCircle aria-hidden className="size-3.5" />
          {c.replyError || 'The reply couldn’t be sent.'}
        </p>
      )}
      {answered && c.repliedBy && (
        <p className="type-caption text-fg-subtle">Answered by {personName(c.repliedBy)}</p>
      )}

      {isDraft ? (
        <>
          <p className="type-small font-medium text-fg-muted">AI draft — edit it if you like:</p>
          <CommentReplyForm
            comment={c}
            initial={{ publicReply: c.publicReply, privateReply: c.privateReply }}
            submitLabel="Send draft"
            onDone={() => undefined}
          />
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            icon={<SkipForward aria-hidden />}
            loading={skip.isPending}
            onClick={doSkip}
          >
            Skip
          </Button>
        </>
      ) : replying ? (
        <CommentReplyForm
          comment={c}
          onDone={() => setReplying(false)}
          onCancel={() => setReplying(false)}
        />
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            icon={<MessageSquareReply aria-hidden />}
            onClick={() => setReplying(true)}
          >
            {answered ? 'Reply again' : 'Reply'}
          </Button>
          {(c.replyStatus === 'NONE' || c.replyStatus === 'FAILED') && (
            <Button
              size="sm"
              variant="ghost"
              icon={<SkipForward aria-hidden />}
              loading={skip.isPending}
              onClick={doSkip}
            >
              Skip
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
