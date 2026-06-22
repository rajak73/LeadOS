// Sprint 7 M1 — Notification HTTP controllers. Thin layer over NotificationService.
// Every endpoint is self-scoped to the authenticated user by the service; no extra
// RBAC permission is required beyond authentication + tenant membership (DM1-b).

import type { Request, Response } from 'express';
import { NotificationType } from '@prisma/client';
import { sendSuccess } from '../../core/http/envelope.js';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode } from '@leados/shared';
import { NotificationService } from './notification.service.js';

function createNotificationController(service: NotificationService) {
  async function list(req: Request, res: Response): Promise<void> {
    const { cursor, limit, unread } = req.query as Record<string, string | undefined>;

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

    const result = await service.listForUser({
      ...(unread === 'true' ? { unread: true } : {}),
      ...(cursorAt !== undefined ? { cursor: cursorAt } : {}),
      ...(cursorId !== undefined ? { cursorId } : {}),
      ...(limit !== undefined ? { limit: parseInt(limit, 10) } : {}),
    });

    sendSuccess(res, result);
  }

  async function markRead(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    await service.markRead(id);
    sendSuccess(res, { ok: true });
  }

  async function markAllRead(req: Request, res: Response): Promise<void> {
    const body = req.body as { ids?: unknown } | undefined;
    const ids = Array.isArray(body?.ids)
      ? body!.ids.filter((x): x is string => typeof x === 'string')
      : undefined;
    const result = await service.markAllRead(ids);
    sendSuccess(res, result);
  }

  async function getPreferences(_req: Request, res: Response): Promise<void> {
    const prefs = await service.getPreferences();
    sendSuccess(res, { preferences: prefs });
  }

  async function updatePreferences(req: Request, res: Response): Promise<void> {
    const body = req.body as { preferences?: unknown } | undefined;
    if (!Array.isArray(body?.preferences)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'preferences must be an array');
    }
    const valid = Object.values(NotificationType) as string[];
    const prefs = body!.preferences
      .filter(
        (p): p is { type: NotificationType; inApp: boolean; email: boolean } =>
          typeof p === 'object' &&
          p !== null &&
          typeof (p as { type?: unknown }).type === 'string' &&
          valid.includes((p as { type: string }).type) &&
          typeof (p as { inApp?: unknown }).inApp === 'boolean' &&
          typeof (p as { email?: unknown }).email === 'boolean',
      );
    const result = await service.updatePreferences(prefs);
    sendSuccess(res, { preferences: result });
  }

  return { list, markRead, markAllRead, getPreferences, updatePreferences };
}

export function buildNotificationController(): ReturnType<typeof createNotificationController> {
  return createNotificationController(new NotificationService());
}
