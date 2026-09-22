import {
  keepPreviousData,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  AiReplyPreview,
  CommentReplyInput,
  CommentReplyPreview,
  CommentReplyStatus,
  ConnectInstagramInput,
  DraftActionInput,
  IgComment,
  IgConversation,
  IgConversationDetail,
  IgMessage,
  InboxCounts,
  InstagramStatus,
  SimulateInstagramInput,
  UpdateConversationInput,
} from '@leados/shared';
import { api, type Paged } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export type ConversationFilter = 'all' | 'unread' | 'attention';

/** Keys of mutations that write to a thread; polling pauses while they run. */
const sendKey = (id: string) => ['instagram', 'send', id] as const;

function invalidateInbox(qc: QueryClient, conversationId?: string) {
  void qc.invalidateQueries({ queryKey: qk.instagram.counts() });
  void qc.invalidateQueries({ queryKey: ['instagram', 'conversations', 'list'] });
  if (conversationId)
    void qc.invalidateQueries({ queryKey: qk.instagram.conversation(conversationId) });
}

// ─── Account ─────────────────────────────────────────────────────────────────

export function useInstagramStatus() {
  return useQuery({
    queryKey: qk.instagram.status(),
    queryFn: () => api.get<InstagramStatus>('/instagram/status'),
  });
}

export function useConnectInstagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ConnectInstagramInput) =>
      api.post<InstagramStatus>('/instagram/connect', body),
    onSuccess: (status) => qc.setQueryData(qk.instagram.status(), status),
  });
}

export function useDisconnectInstagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<InstagramStatus>('/instagram/disconnect'),
    onSuccess: (status) => qc.setQueryData(qk.instagram.status(), status),
  });
}

export function useSimulateInstagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SimulateInstagramInput) =>
      api.post<{ conversationId: string } | { commentId: string }>('/instagram/simulate', body),
    onSuccess: () => {
      invalidateInbox(qc);
      void qc.invalidateQueries({ queryKey: qk.instagram.comments() });
      void qc.invalidateQueries({ queryKey: qk.instagram.status() });
    },
  });
}

// ─── Inbox ───────────────────────────────────────────────────────────────────

/** Sidebar badge counts, polled every 20 s (paused while the tab is hidden). */
export function useInboxCounts(enabled = true) {
  return useQuery({
    queryKey: qk.instagram.counts(),
    queryFn: () => api.get<InboxCounts>('/instagram/counts'),
    refetchInterval: 20_000,
    enabled,
  });
}

export function useConversations(params: {
  filter: ConversationFilter;
  search?: string;
  page?: number;
}) {
  return useQuery({
    queryKey: qk.instagram.conversationList(params),
    queryFn: ({ signal }) =>
      api.list<IgConversation>('/instagram/conversations', { ...params, limit: 50 }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
}

export function useConversation(id: string | undefined) {
  const sending = useIsMutating({ mutationKey: sendKey(id ?? '') });
  return useQuery({
    queryKey: qk.instagram.conversation(id ?? ''),
    queryFn: () => api.get<IgConversationDetail>(`/instagram/conversations/${id}`),
    enabled: Boolean(id),
    refetchInterval: sending ? false : 5_000,
  });
}

/** Patch a conversation's summary in every cached list and in its detail. */
function patchConversation(qc: QueryClient, id: string, patch: Partial<IgConversation>) {
  qc.setQueriesData<Paged<IgConversation[]>>(
    { queryKey: ['instagram', 'conversations', 'list'] },
    (old) =>
      old ? { ...old, data: old.data.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : old,
  );
  qc.setQueryData<IgConversationDetail>(qk.instagram.conversation(id), (old) =>
    old ? { ...old, ...patch } : old,
  );
}

export function useUpdateConversation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateConversationInput) =>
      api.patch<IgConversation>(`/instagram/conversations/${id}`, body),
    onMutate: (body) => {
      if (body.markRead) patchConversation(qc, id, { unreadCount: 0 });
      if (body.aiEnabled !== undefined)
        patchConversation(qc, id, {
          aiEnabled: body.aiEnabled,
          ...(body.aiEnabled && { aiPausedReason: null }),
        });
    },
    onSuccess: (conversation) => patchConversation(qc, id, conversation),
    onSettled: () => invalidateInbox(qc, id),
  });
}

export function useCreateConversationLead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<IgConversation>(`/instagram/conversations/${id}/lead`),
    onSuccess: (conversation) => {
      patchConversation(qc, id, conversation);
      void qc.invalidateQueries({ queryKey: qk.leads.all });
    },
  });
}

/** Send a DM. The message appears straight away and is removed again if sending fails. */
export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  const key = qk.instagram.conversation(conversationId);
  return useMutation({
    mutationKey: sendKey(conversationId),
    mutationFn: (text: string) =>
      api.post<IgMessage>(`/instagram/conversations/${conversationId}/messages`, { text }),
    onMutate: async (text) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<IgConversationDetail>(key);
      const now = new Date().toISOString();
      const temp: IgMessage = {
        id: `temp-${Date.now()}`,
        conversationId,
        direction: 'OUTBOUND',
        text,
        attachments: [],
        author: 'USER',
        sentBy: null,
        status: 'SENDING',
        error: null,
        createdAt: now,
        sentAt: null,
      };
      qc.setQueryData<IgConversationDetail>(key, (old) =>
        old ? { ...old, messages: [...old.messages, temp] } : old,
      );
      return { previous, tempId: temp.id };
    },
    onError: (_e, _text, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (message, _text, ctx) => {
      qc.setQueryData<IgConversationDetail>(key, (old) =>
        old
          ? {
              ...old,
              needsAttention: false,
              hasDraft: false,
              messages: old.messages
                .map((m) => (m.id === ctx?.tempId ? message : m))
                .map((m) => (m.status === 'DRAFT' ? { ...m, status: 'DISCARDED' as const } : m)),
            }
          : old,
      );
    },
    onSettled: () => invalidateInbox(qc, conversationId),
  });
}

export function useSuggestReply(conversationId: string) {
  return useMutation({
    mutationFn: () =>
      api.post<AiReplyPreview>(`/instagram/conversations/${conversationId}/suggest`),
  });
}

export function useDraftAction(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: sendKey(conversationId),
    mutationFn: ({ messageId, ...body }: DraftActionInput & { messageId: string }) =>
      api.post<IgMessage>(`/instagram/messages/${messageId}/draft`, body),
    onSuccess: (message) => {
      qc.setQueryData<IgConversationDetail>(qk.instagram.conversation(conversationId), (old) =>
        old
          ? {
              ...old,
              hasDraft: false,
              messages: old.messages.map((m) => (m.id === message.id ? message : m)),
            }
          : old,
      );
    },
    onSettled: () => invalidateInbox(qc, conversationId),
  });
}

// ─── Comments ────────────────────────────────────────────────────────────────

export function useComments(params: { status?: CommentReplyStatus[]; page: number }) {
  return useQuery({
    queryKey: qk.instagram.commentList(params),
    queryFn: ({ signal }) =>
      api.list<IgComment>('/instagram/comments', { ...params, limit: 30 }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

function useCommentMutation<V>(fn: (vars: V) => Promise<IgComment>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (comment) => {
      qc.setQueriesData<Paged<IgComment[]>>(
        { queryKey: ['instagram', 'comments', 'list'] },
        (old) =>
          old ? { ...old, data: old.data.map((c) => (c.id === comment.id ? comment : c)) } : old,
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.instagram.comments() });
      void qc.invalidateQueries({ queryKey: qk.instagram.counts() });
    },
  });
}

export function useReplyToComment() {
  return useCommentMutation(({ id, ...body }: CommentReplyInput & { id: string }) =>
    api.post<IgComment>(`/instagram/comments/${id}/reply`, body),
  );
}

export function useSkipComment() {
  return useCommentMutation((id: string) => api.post<IgComment>(`/instagram/comments/${id}/skip`));
}

export function useSuggestCommentReply() {
  return useMutation({
    mutationFn: (id: string) => api.post<CommentReplyPreview>(`/instagram/comments/${id}/suggest`),
  });
}
