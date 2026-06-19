// AUD-2 — audit write path. Records an org-scoped, append-only audit row with PII-masked
// before/after snapshots. The org/actor/ip come from the request tenant context (so callers
// pass only WHAT happened, never who/where). Non-blocking-but-durable: a write failure is
// logged, not propagated, so auditing never breaks the user action.

import type { Prisma } from '@prisma/client';
import { withTenant } from '../tenancy/with-tenant.js';
import { requireTenantContext, type TenantContext } from '../tenancy/context.js';
import { asTenantCreate } from '../tenancy/tenant-repository.js';
import { logger } from '../observability/logger.js';
import { maskPii } from './pii-masking.js';

export interface AuditInput {
  action: string;
  resource: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
}

export interface AuditRecorder {
  record(input: AuditInput): Promise<void>;
}

/** The org-free audit row (organizationId is injected by the tenant extension). */
export type AuditRow = Omit<Prisma.AuditLogUncheckedCreateInput, 'organizationId'>;

/** Build the masked, context-stamped audit row. Pure — unit-testable without a DB. */
export function buildAuditRow(input: AuditInput, ctx: TenantContext): AuditRow {
  const row: AuditRow = {
    actorUserId: ctx.userId,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId ?? null,
    ipAddress: ctx.ipAddress ?? null,
  };
  if (input.before !== undefined) row.before = maskPii(input.before) as Prisma.InputJsonValue;
  if (input.after !== undefined) row.after = maskPii(input.after) as Prisma.InputJsonValue;
  return row;
}

export class PrismaAuditRecorder implements AuditRecorder {
  async record(input: AuditInput): Promise<void> {
    const ctx = requireTenantContext();
    const row = buildAuditRow(input, ctx);
    try {
      await withTenant(ctx.organizationId, (db) =>
        db.auditLog.create({ data: asTenantCreate<Prisma.AuditLogUncheckedCreateInput>(row) }),
      );
    } catch (err) {
      // Durability is best-effort: never break the user action on an audit failure, but make
      // the loss observable.
      logger.error('audit write failed', { action: input.action, resource: input.resource, err });
    }
  }
}

/** No-op recorder for tests / contexts where auditing is disabled. */
export class NoopAuditRecorder implements AuditRecorder {
  record(): Promise<void> {
    return Promise.resolve();
  }
}
