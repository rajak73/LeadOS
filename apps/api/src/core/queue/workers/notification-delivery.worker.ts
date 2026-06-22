// Sprint 7 M1 — notification delivery worker. The async producer path: persist the
// notification (+activity, +preference-gated email) via NotificationService, then push a
// realtime hint to the org room using the worker's Redis emitter (notifyOrg). The inbox
// integration calls NotificationService.notify() inline; this worker is for callers that
// prefer to enqueue. Both share the same idempotent service logic.

import type { Job } from 'bullmq';
import { logger } from '../../observability/logger.js';
import type { EmailTemplateKey } from './email-delivery.worker.js';

export const NOTIFICATION_DELIVERY_JOB = 'notification-deliver';

export interface NotificationDeliveryPayload {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  performedById?: string;
  email?: { templateKey: EmailTemplateKey; data: Record<string, string> };
}

export async function processNotificationDeliveryJob(job: Job<NotificationDeliveryPayload>): Promise<void> {
  const { NotificationService } = await import('../../../modules/notifications/notification.service.js');
  const { NotificationType } = await import('@prisma/client');

  const data = job.data;
  if (!(Object.values(NotificationType) as string[]).includes(data.type)) {
    logger.warn({ message: 'notification-delivery: unknown type, skipped', type: data.type });
    return;
  }

  const service = new NotificationService();
  const notification = await service.notify({
    organizationId: data.organizationId,
    userId: data.userId,
    type: data.type as (typeof NotificationType)[keyof typeof NotificationType],
    title: data.title,
    body: data.body,
    ...(data.entityType !== undefined ? { entityType: data.entityType } : {}),
    ...(data.entityId !== undefined ? { entityId: data.entityId } : {}),
    ...(data.performedById !== undefined ? { performedById: data.performedById } : {}),
    ...(data.email !== undefined ? { email: data.email } : {}),
  });

  if (notification) {
    const { notifyOrg } = await import('../../realtime/notification-publisher.js');
    notifyOrg(data.organizationId, 'notification', { id: notification.id });
  }
}
