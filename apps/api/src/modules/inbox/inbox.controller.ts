// Inbox HTTP controllers — thin layer over InboxService.
// Each handler parses query params and delegates to InboxService.

import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/http/envelope.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode } from '@leados/shared';
import { requireTenantContext } from '../../core/tenancy/context.js';
import { InboxService } from './inbox.service.js';

function createInboxController(service: InboxService) {
  async function listConversations(req: Request, res: Response): Promise<void> {
    const { accountId, assignedToId, status, cursor, limit } = req.query as Record<string, string | undefined>;

    let cursorAt: string | undefined;
    let cursorId: string | undefined;
    if (cursor) {
      try {
        const parsed = JSON.parse(decodeURIComponent(cursor)) as { at?: string; id?: string };
        cursorAt = parsed.at ?? undefined;
        cursorId = parsed.id ?? undefined;
      } catch {
        // ignore malformed cursor
      }
    }

    const result = await service.listConversations({
      ...(accountId !== undefined ? { accountId } : {}),
      ...(assignedToId !== undefined ? { assignedToId } : {}),
      ...(status === 'OPEN' || status === 'CLOSED' ? { status } : {}),
      ...(cursorAt !== undefined ? { cursor: cursorAt } : {}),
      ...(cursorId !== undefined ? { cursorId } : {}),
      ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
    });

    sendSuccess(res, { items: result.items, nextCursor: result.nextCursor ?? null });
  }

  async function getConversation(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const conv = await service.getConversation(id);
    sendSuccess(res, conv);
  }

  async function listMessages(req: Request, res: Response): Promise<void> {
    const { id: conversationId } = req.params as { id: string };
    const { cursor, limit } = req.query as Record<string, string | undefined>;

    let cursorAt: string | undefined;
    let cursorId: string | undefined;
    if (cursor) {
      try {
        const parsed = JSON.parse(decodeURIComponent(cursor)) as { at?: string; id?: string };
        cursorAt = parsed.at ?? undefined;
        cursorId = parsed.id ?? undefined;
      } catch {
        // ignore malformed cursor
      }
    }

    const result = await service.listMessages(conversationId, {
      ...(cursorAt !== undefined ? { cursor: cursorAt } : {}),
      ...(cursorId !== undefined ? { cursorId } : {}),
      ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
    });

    sendSuccess(res, { items: result.items, nextCursor: result.nextCursor ?? null });
  }

  async function updateConversation(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const body = req.body as { assignedToId?: string | null; status?: string } | undefined;
    const patch: { assignedToId?: string | null; status?: 'OPEN' | 'CLOSED' } = {};
    if (body && 'assignedToId' in body) patch.assignedToId = body.assignedToId ?? null;
    if (body?.status === 'OPEN' || body?.status === 'CLOSED') patch.status = body.status;
    const result = await service.updateConversation(id, patch);
    sendSuccess(res, result);
  }

  async function sendMessage(req: Request, res: Response): Promise<void> {
    const { id: conversationId } = req.params as { id: string };
    const body = req.body as { content?: { text?: string } } | undefined;
    const text = body?.content?.text;

    if (typeof text !== 'string' || text.trim() === '') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'content.text is required and must be a non-empty string');
    }

    const ctx = requireTenantContext();
    const result = await service.sendMessage(conversationId, { text: text.trim() }, ctx.userId);
    sendSuccess(res, result, 201);
  }

  // ─── Saved Replies ────────────────────────────────────────────────────────

  async function listSavedReplies(req: Request, res: Response): Promise<void> {
    const q = typeof req.query['q'] === 'string' && req.query['q'].trim() ? req.query['q'].trim() : undefined;
    const items = await service.listSavedReplies(q);
    sendSuccess(res, { items });
  }

  async function createSavedReply(req: Request, res: Response): Promise<void> {
    const body = req.body as { title?: string; content?: string; shortcut?: string; isGlobal?: boolean } | undefined;
    if (!body?.title || typeof body.title !== 'string' || !body.title.trim()) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'title is required');
    }
    if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'content is required');
    }
    const shortcutVal = typeof body.shortcut === 'string' ? body.shortcut.trim() : undefined;
    const createData: Parameters<typeof service.createSavedReply>[0] = {
      title: body.title.trim(),
      content: body.content.trim(),
      isGlobal: body.isGlobal !== false,
    };
    if (shortcutVal) createData.shortcut = shortcutVal;
    const result = await service.createSavedReply(createData);
    sendSuccess(res, result, 201);
  }

  async function updateSavedReply(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const body = req.body as { title?: string; content?: string; shortcut?: string | null; isGlobal?: boolean } | undefined;
    const patch: { title?: string; content?: string; shortcut?: string | null; isGlobal?: boolean } = {};
    if (typeof body?.title === 'string') patch.title = body.title.trim();
    if (typeof body?.content === 'string') patch.content = body.content.trim();
    if ('shortcut' in (body ?? {})) patch.shortcut = body?.shortcut ?? null;
    if (typeof body?.isGlobal === 'boolean') patch.isGlobal = body.isGlobal;
    const result = await service.updateSavedReply(id, patch);
    sendSuccess(res, result);
  }

  async function deleteSavedReply(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    await service.deleteSavedReply(id);
    res.status(204).end();
  }

  // ─── Create Lead from Conversation ───────────────────────────────────────

  async function createLeadFromConversation(req: Request, res: Response): Promise<void> {
    const { id: conversationId } = req.params as { id: string };
    const body = req.body as { firstName?: string; lastName?: string } | undefined;
    if (!body?.firstName || typeof body.firstName !== 'string' || !body.firstName.trim()) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'firstName is required');
    }
    const createData: Parameters<typeof service.createLeadFromConversation>[1] = {
      firstName: body.firstName.trim(),
    };
    if (typeof body.lastName === 'string' && body.lastName.trim()) {
      createData.lastName = body.lastName.trim();
    }
    const lead = await service.createLeadFromConversation(conversationId, createData);
    sendSuccess(res, lead, 201);
  }

  return {
    listConversations,
    getConversation,
    updateConversation,
    listMessages,
    sendMessage,
    listSavedReplies,
    createSavedReply,
    updateSavedReply,
    deleteSavedReply,
    createLeadFromConversation,
  };
}

export function buildInboxController(): ReturnType<typeof createInboxController> {
  return createInboxController(new InboxService());
}
