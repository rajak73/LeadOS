import { useSearchParams } from 'react-router';
import { ExternalLink, ImageOff, MessageSquare, SearchX } from 'lucide-react';
import type { CommentReplyStatus, IgComment } from '@leados/shared';
import { useComments } from '@/api/instagram';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/features/tasks/segmented-control';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { errorMessage } from '@/lib/api-client';
import { CommentItem } from './comment-item';

type StatusFilter = 'all' | 'needs-reply' | 'draft' | 'replied' | 'skipped';

const FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'needs-reply', label: 'Needs reply' },
  { value: 'draft', label: 'Draft ready' },
  { value: 'replied', label: 'Replied' },
  { value: 'skipped', label: 'Skipped' },
];

const STATUSES: Record<StatusFilter, CommentReplyStatus[] | undefined> = {
  all: undefined,
  'needs-reply': ['NONE', 'FAILED'],
  draft: ['DRAFT'],
  replied: ['REPLIED'],
  skipped: ['SKIPPED'],
};

interface PostGroup {
  media: IgComment['media'];
  comments: IgComment[];
}

/** Groups comments by post, keeping the newest-first order of the list. */
export function groupByPost(comments: IgComment[]): PostGroup[] {
  const groups = new Map<string, PostGroup>();
  for (const c of comments) {
    const g = groups.get(c.media.id);
    if (g) g.comments.push(c);
    else groups.set(c.media.id, { media: c.media, comments: [c] });
  }
  return [...groups.values()];
}

function PostHeader({ media, id }: { media: IgComment['media']; id: string }) {
  const caption = media.caption?.trim();
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3">
      {media.thumbnailUrl ? (
        <img
          src={media.thumbnailUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-12 shrink-0 rounded-md bg-muted object-cover"
        />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-fg-subtle">
          <ImageOff aria-hidden className="size-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 id={id} className="line-clamp-2 type-small font-medium text-fg">
          {caption ? caption : 'Post without a caption'}
        </h2>
        {media.permalink && (
          <a
            href={media.permalink}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 type-caption text-fg-muted hover:text-fg hover:underline"
          >
            View post on Instagram
            <ExternalLink aria-hidden className="size-3" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
    </div>
  );
}

function CommentsSkeleton() {
  return (
    <LoadingRegion label="Loading comments…" className="flex flex-col gap-4">
      {[0, 1].map((i) => (
        <Card key={i} className="space-y-3 p-4">
          <div className="flex gap-3">
            <Skeleton className="size-12" />
            <Skeleton className="h-4 flex-1" />
          </div>
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-4/5" />
        </Card>
      ))}
    </LoadingRegion>
  );
}

export default function CommentsPage() {
  useDocumentTitle('Instagram comments');
  const [params, setParams] = useSearchParams();
  const raw = params.get('status') as StatusFilter | null;
  const filter: StatusFilter = raw && raw in STATUSES ? raw : 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { data, isLoading, error, refetch } = useComments({ status: STATUSES[filter], page });
  const groups = groupByPost(data?.data ?? []);

  const setParam = (key: string, value: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <SegmentedControl
          label="Show comments"
          value={filter}
          options={FILTERS}
          onChange={(v) => setParam('status', v === 'all' ? null : v)}
        />
      </div>
      {isLoading ? (
        <CommentsSkeleton />
      ) : error && !data ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : groups.length === 0 ? (
        <Card>
          {filter === 'all' ? (
            <EmptyState
              icon={MessageSquare}
              title="No comments yet"
              text="Comments on your Instagram posts show up here, so you can answer them in one place."
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="Nothing here"
              text="No comments match this filter right now."
            />
          )}
        </Card>
      ) : (
        <>
          {groups.map((g) => (
            <Card key={g.media.id}>
              <section aria-labelledby={`post-${g.media.id}`}>
                <PostHeader media={g.media} id={`post-${g.media.id}`} />
                <ul className="divide-y divide-border">
                  {g.comments.map((c) => (
                    <li key={c.id}>
                      <CommentItem comment={c} />
                    </li>
                  ))}
                </ul>
              </section>
            </Card>
          ))}
          <Pagination
            meta={data?.meta}
            noun="comments"
            onPageChange={(p) => setParam('page', String(p))}
          />
        </>
      )}
    </div>
  );
}
