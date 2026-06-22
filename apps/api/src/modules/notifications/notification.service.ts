// Sprint 7 M1 — Notification service.
//
// notify() is the cross-process producer entry point: it persists a notification,
// appends a NOTIFICATION_SENT activity, and (per preference + flag) enqueues an email —
// all inside one withTenant transaction. Realtime emit is the CALLER's responsibility
// because the emitter differs by process (emitToOrg in the API, notifyOrg in the worker);
// callers emit AFTER notify() resolves, preserving persist-then-emit ordering (DM1-d).
//
// The HTTP methods (list/markRead/preferences) are self-scoped to the authenticated user.

import { NotificationType } from '@prisma/client';
import type { Notification } from '@prisma/client';
import { ActivityType } from '@leados/shared';
import { AppError } from '../../core/errors/app-error.js';
import { ErrorCode } from '@leados/shared';
import { logger } from '../../core/observability/logger.js';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import { requireTenantContext } from '../../core/tenancy/context.js';
import { ActivityService } from '../../core/activities/activity.service.js';
import { isEnabled } from '../../core/flags/flags.js';
import { enqueue } from '../../core/queue/queues.js';
import { QUEUE } from '../../core/queue/names.js';
import {
  EMAIL_DELIVERY_JOB,
  type EmailDeliveryPayload,
  type EmailTemplateKey,
} from '../../core/queue/workers/email-delivery.worker.js';
import {
  NotificationRepository,
  NotificationPreferenceRepository,
  type NotificationListQuery,
  type EffectivePreference,
} from './notification.repository.js';

export interface NotifyInput {
  organizationId: string;
  userId: string; // recipient
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  performedById?: string; // actor who caused the notification
  email?: { templateKey: EmailTemplateKey; data: Record<string, string> };
}

export interface NotificationListResult {
  items: Notification[];
  nextCursor: string | null;
  unreadCount: number;
}

export class NotificationService {
  private readonly activityService = new ActivityService();

  /**
   * Persist a notification + activity, conditionally enqueue email. Returns the created
   * notification, or null if the recipient has opted out of both channels for this type.
   * Does NOT emit realtime — the caller emits with its process-appropriate emitter.
   */
  async notify(input: NotifyInput): Promise<Notification | null> {
    return withTenant(input.organizationId, async (db) => {
      const prefRepo = new NotificationPreferenceRepository(db);
      const pref = await prefRepo.getEffective(input.userId, input.type);
      if (!pref.inApp && !pref.email) return null;

      const repo = new NotificationRepository(db);
      const notification = await repo.create({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        channel: 'IN_APP',
      });

      // Append a NOTIFICATION_SENT activity, linked to the related conversation so it
      // satisfies activities_entity_required (extended in migration 0019). The activity
      // feed is entity-scoped, so we only record it when there is an entity to link.
      const relatedConversationId =
        input.entityType === 'conversation' && input.entityId ? input.entityId : undefined;
      if (relatedConversationId) {
        await this.activityService.append(
          db,
          {
            organizationId: input.organizationId,
            userId: input.performedById ?? input.userId,
            role: 'SYSTEM',
            isSuperAdmin: false,
          },
          {
            type: ActivityType.NOTIFICATION_SENT,
            description: `Notification sent: ${input.title}`,
            metadata: {
              type: ActivityType.NOTIFICATION_SENT,
              notificationId: notification.id,
              notificationType: input.type,
              recipientUserId: input.userId,
              channel: 'IN_APP',
            },
            relatedConversationId,
          },
        );
      }

      // Email is opt-in: requires the per-type preference AND the global flag AND a template.
      if (pref.email && input.email && isEnabled('notifications.email.enabled')) {
        const user = await db.user.findUnique({ where: { id: input.userId }, select: { email: true } });
        if (user?.email) {
          const payload: EmailDeliveryPayload = {
            to: user.email,
            templateKey: input.email.templateKey,
            data: input.email.data,
          };
          await enqueue(QUEUE.EMAIL_DELIVERY, EMAIL_DELIVERY_JOB, payload);
        }
      }

      logger.debug({ message: 'notification persisted', userId: input.userId, type: input.type });
      return notification;
    });
  }

  // ─── HTTP methods (self-scoped to the authenticated user) ───────────────────

  async listForUser(query: Omit<NotificationListQuery, 'userId'>): Promise<NotificationListResult> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new NotificationRepository(db);
      const { items, nextCursor } = await repo.list({ ...query, userId: ctx.userId });
      const unreadCount = await repo.unreadCount(ctx.userId);
      return { items, nextCursor, unreadCount };
    });
  }

  async markRead(id: string): Promise<void> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new NotificationRepository(db);
      const existing = await repo.findForUser(ctx.userId, id);
      if (!existing) throw new AppError(ErrorCode.NOTIFICATION_NOT_FOUND, `Notification ${id} not found`);
      await repo.markRead(ctx.userId, id);
    });
  }

  async markAllRead(ids?: string[]): Promise<{ updated: number }> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new NotificationRepository(db);
      const updated = await repo.markManyRead(ctx.userId, ids);
      return { updated };
    });
  }

  async getPreferences(): Promise<EffectivePreference[]> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      return new NotificationPreferenceRepository(db).listEffective(ctx.userId);
    });
  }

  async updatePreferences(
    prefs: Array<{ type: NotificationType; inApp: boolean; email: boolean }>,
  ): Promise<EffectivePreference[]> {
    const ctx = requireTenantContext();
    return withTenant(ctx.organizationId, async (db) => {
      const repo = new NotificationPreferenceRepository(db);
      for (const p of prefs) {
        if (!Object.values(NotificationType).includes(p.type)) continue;
        await repo.upsert(ctx.userId, ctx.organizationId, p.type, { inApp: p.inApp, email: p.email });
      }
      return repo.listEffective(ctx.userId);
    });
  }
}
