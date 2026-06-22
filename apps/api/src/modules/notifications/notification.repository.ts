// Sprint 7 M1 — Notification repositories. Extend TenantRepository; used inside withTenant().
// organizationId is injected by the tenant extension; callers never supply it. Notifications
// are additionally per-user — every method filters by the recipient userId.

import type { Notification, NotificationPreference, Prisma } from '@prisma/client';
import { NotificationType } from '@prisma/client';
import { TenantRepository, asTenantCreate } from '../../core/tenancy/tenant-repository.js';
import type { TenantTransactionClient } from '../../core/tenancy/with-tenant.js';

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
  channel?: 'IN_APP' | 'EMAIL';
}

export interface NotificationListQuery {
  userId: string;
  unread?: boolean;
  cursor?: string; // ISO date string of createdAt
  cursorId?: string;
  limit?: number;
}

export class NotificationRepository extends TenantRepository {
  constructor(db: TenantTransactionClient) {
    super(db);
  }

  async create(data: CreateNotificationData): Promise<Notification> {
    return this.db.notification.create({
      data: asTenantCreate<Prisma.NotificationUncheckedCreateInput>({
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        channel: data.channel ?? 'IN_APP',
      }),
    });
  }

  async list(query: NotificationListQuery): Promise<{ items: Notification[]; nextCursor: string | null }> {
    const limit = Math.min(query.limit ?? 20, 50);
    const where: Prisma.NotificationWhereInput = { userId: query.userId };
    if (query.unread) where.readAt = null;

    // Cursor: createdAt DESC, then id ASC for stability
    if (query.cursor && query.cursorId) {
      where.OR = [
        { createdAt: { lt: new Date(query.cursor) } },
        { createdAt: new Date(query.cursor), id: { gt: query.cursorId } },
      ];
    }

    const items = await this.db.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
    });

    const hasNext = items.length > limit;
    if (hasNext) items.pop();

    const lastItem = items[items.length - 1];
    const nextCursor =
      hasNext && lastItem
        ? JSON.stringify({ at: lastItem.createdAt.toISOString(), id: lastItem.id })
        : null;

    return { items, nextCursor };
  }

  /** Count of unread notifications for the user (for the bell badge). */
  async unreadCount(userId: string): Promise<number> {
    return this.db.notification.count({ where: { userId, readAt: null } });
  }

  /** Find one notification owned by the user, or null. */
  async findForUser(userId: string, id: string): Promise<Notification | null> {
    return this.db.notification.findFirst({ where: { id, userId } });
  }

  /** Mark a single owned notification read. Returns false if it does not exist for the user. */
  async markRead(userId: string, id: string): Promise<boolean> {
    const result = await this.db.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count > 0;
  }

  /** Mark many (or all) of the user's unread notifications read. Returns the count updated. */
  async markManyRead(userId: string, ids?: string[]): Promise<number> {
    const where: Prisma.NotificationWhereInput = { userId, readAt: null };
    if (ids && ids.length > 0) where.id = { in: ids };
    const result = await this.db.notification.updateMany({ where, data: { readAt: new Date() } });
    return result.count;
  }
}

export interface EffectivePreference {
  type: NotificationType;
  inApp: boolean;
  email: boolean;
}

export class NotificationPreferenceRepository extends TenantRepository {
  constructor(db: TenantTransactionClient) {
    super(db);
  }

  async listForUser(userId: string): Promise<NotificationPreference[]> {
    return this.db.notificationPreference.findMany({ where: { userId } });
  }

  /**
   * Effective preference for a single (user, type) — the stored row if present,
   * else the type default (in-app on, email off). No rows are pre-seeded (DM1-e).
   */
  async getEffective(userId: string, type: NotificationType): Promise<EffectivePreference> {
    const row = await this.db.notificationPreference.findFirst({ where: { userId, type } });
    if (row) return { type, inApp: row.inApp, email: row.email };
    return { type, inApp: true, email: false };
  }

  /** All types with effective values merged over stored rows (drives the preferences screen). */
  async listEffective(userId: string): Promise<EffectivePreference[]> {
    const rows = await this.listForUser(userId);
    const byType = new Map(rows.map((r) => [r.type, r]));
    return Object.values(NotificationType).map((type) => {
      const row = byType.get(type);
      return { type, inApp: row?.inApp ?? true, email: row?.email ?? false };
    });
  }

  async upsert(
    userId: string,
    organizationId: string,
    type: NotificationType,
    values: { inApp: boolean; email: boolean },
  ): Promise<NotificationPreference> {
    return this.db.notificationPreference.upsert({
      where: { organizationId_userId_type: { organizationId, userId, type } },
      create: asTenantCreate<Prisma.NotificationPreferenceUncheckedCreateInput>({
        userId,
        type,
        inApp: values.inApp,
        email: values.email,
      }),
      update: { inApp: values.inApp, email: values.email },
    });
  }
}
