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

  return { listConversations, getConversation, updateConversation, listMessages, sendMessage };
}

export function buildInboxController(): ReturnType<typeof createInboxController> {
  return createInboxController(new InboxService());
}
