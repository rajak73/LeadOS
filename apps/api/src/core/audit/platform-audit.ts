// AUD-3 — platform/super-admin audit SCAFFOLD (FINAL_ARCHITECTURE §2.3).
//
// Records actions taken on the platform/support path (the leados_platform_admin BYPASSRLS role).
// platform_audit_logs is NOT tenant-scoped, so this writes via the raw admin client (NOT
// withTenant) — there is no tenant GUC for a cross-org platform action. The full super-admin
// runtime (2FA, scoped sessions, the dedicated connection) is a later milestone; this is the
// durable write surface those paths will use.

import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client.js';
import { logger } from '../observability/logger.js';
import { maskPii } from './pii-masking.js';

export interface PlatformAuditInput {
  actorUserId?: string | null;
  action: string;
  targetOrganizationId?: string | null;
  targetResource?: string | null;
  detail?: unknown;
  ipAddress?: string | null;
}

export interface PlatformAuditWriter {
  record(input: PlatformAuditInput): Promise<void>;
}

export class PrismaPlatformAuditWriter implements PlatformAuditWriter {
  async record(input: PlatformAuditInput): Promise<void> {
    const data: Prisma.PlatformAuditLogUncheckedCreateInput = {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetOrganizationId: input.targetOrganizationId ?? null,
      targetResource: input.targetResource ?? null,
      ipAddress: input.ipAddress ?? null,
    };
    if (input.detail !== undefined) data.detail = maskPii(input.detail) as Prisma.InputJsonValue;
    try {
      // Raw client (no withTenant): platform actions are cross-org and not RLS-scoped.
      await prisma.platformAuditLog.create({ data });
    } catch (err) {
      logger.error('platform audit write failed', { action: input.action, err });
    }
  }
}
