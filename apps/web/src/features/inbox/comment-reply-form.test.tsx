import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { commentReplySchema, type IgComment } from '@leados/shared';
import { mockFetch } from '@/test/fetch-mock';
import { Providers } from '@/test/utils';
import { CommentReplyForm } from './comment-reply-form';

vi.mock('@/lib/toast', () => ({ notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

afterEach(() => vi.unstubAllGlobals());

const comment: IgComment = {
  id: 'k1',
  commentId: '1789',
  parentCommentId: null,
  media: { id: 'p1', permalink: null, caption: 'New look', thumbnailUrl: null },
  fromUsername: 'priya.designs',
  text: 'Price please?',
  lead: null,
  replyStatus: 'NONE',
  publicReply: null,
  privateReply: null,
  privateReplySent: false,
  replyError: null,
  skipReason: null,
  repliedBy: null,
  commentedAt: '2026-09-22T10:00:00.000Z',
};

const PATH = '/instagram/comments/k1/reply';

describe('CommentReplyForm', () => {
  it('needs a public reply or a private message', async () => {
    const user = userEvent.setup();
    const api = mockFetch({ [`POST ${PATH}`]: { ...comment, replyStatus: 'REPLIED' } });
    const onDone = vi.fn();
    render(
      <Providers>
        <CommentReplyForm comment={comment} onDone={onDone} />
      </Providers>,
    );

    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(
      await screen.findByText('Write a public reply, a private message, or both'),
    ).toBeInTheDocument();
    expect(api.bodies('POST', PATH)).toHaveLength(0);

    await user.type(
      screen.getByRole('textbox', { name: 'Private message' }),
      'Sent you the prices!',
    );
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [body] = api.bodies('POST', PATH);
    expect(body).toEqual({ publicReply: null, privateReply: 'Sent you the prices!' });
    expect(commentReplySchema.safeParse(body).success).toBe(true);
  });

  it('locks the private message once one was sent', () => {
    mockFetch();
    render(
      <Providers>
        <CommentReplyForm comment={{ ...comment, privateReplySent: true }} onDone={vi.fn()} />
      </Providers>,
    );
    expect(screen.getByRole('textbox', { name: 'Private message' })).toBeDisabled();
  });
});
