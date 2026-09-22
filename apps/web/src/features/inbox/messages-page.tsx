import { useParams } from 'react-router';
import { MessageCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { cn } from '@/lib/cn';
import { ConversationList } from './conversation-list';
import { ConversationThread } from './conversation-thread';

/**
 * Two panes when the inbox itself is wide enough (list + thread). Narrower — a phone, or a
 * laptop where the sidebar takes room — only one pane shows: the list at /inbox, the thread
 * (with a back button) at /inbox/:id. Sized by container, not viewport, so the thread never
 * gets squeezed into a sliver next to the list.
 */
export default function MessagesPage() {
  const { id } = useParams();
  useDocumentTitle('Inbox');

  return (
    <div className="@container flex h-[calc(100dvh-14rem)] min-h-[22rem] overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <section
        aria-label="Conversations"
        className={cn(
          'min-h-0 w-full flex-col border-border @3xl:flex @3xl:w-[300px] @3xl:shrink-0 @3xl:border-r @5xl:w-[360px]',
          id ? 'hidden' : 'flex',
        )}
      >
        <ConversationList activeId={id} />
      </section>
      <section
        aria-label="Conversation"
        className={cn('min-h-0 min-w-0 flex-1 flex-col @3xl:flex', id ? 'flex' : 'hidden')}
      >
        {id ? (
          <ConversationThread key={id} id={id} />
        ) : (
          <EmptyState
            className="flex-1"
            icon={MessageCircle}
            title="Pick a conversation"
            text="Choose a chat on the left to read it and reply."
          />
        )}
      </section>
    </div>
  );
}
