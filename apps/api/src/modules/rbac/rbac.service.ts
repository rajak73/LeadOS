// RBAC-2.3 + RBAC-2.4 — role administration with active cache invalidation.
//
// Any change to a member's role/status invalidates their cached permission + membership
// entries, so the next request re-resolves from the DB (closing the MT-2 / SEC-M2-2 staleness
// window). DI: repository + invalidator are injected for unit testing.

import { AppError } from '../../core/errors/app-error.js';
import type { AuditRecorder } from '../../core/audit/audit-recorder.js';
import type { RbacRepository, RoleSummary } from './rbac.repository.js';

/** Purges a member's cached permission + membership entries (RBAC-2.4). */
export interface MemberInvalidator {
  invalidate(organizationId: string, userId: string): Promise<void>;
}

export class RbacService {
  constructor(
    private readonly repo: RbacRepository,
    private readonly invalidator: MemberInvalidator,
    private readonly audit: AuditRecorder,
  ) {}

  listRoles(organizationId: string): Promise<RoleSummary[]> {
    return this.repo.listRoles(organizationId);
  }

  async assignRole(organizationId: string, userId: string, roleId: string): Promise<void> {
    if (!(await this.repo.roleExists(organizationId, roleId))) {
      throw AppError.validation('Unknown role for this organization.');
    }
    const before = await this.repo.getMemberSnapshot(organizationId, userId);
    const changed = await this.repo.assignRole(organizationId, userId, roleId);
    if (!changed || before === null) {
      throw AppError.notFound('Member not found in this organization.');
    }
    await this.invalidator.invalidate(organizationId, userId);
    await this.audit.record({
      action: 'member.role_changed',
      resource: 'organization_member',
      resourceId: userId,
      before: { roleId: before.roleId },
      after: { roleId },
    });
  }

  async suspendMember(organizationId: string, userId: string): Promise<void> {
    const before = await this.repo.getMemberSnapshot(organizationId, userId);
    const changed = await this.repo.suspendMember(organizationId, userId);
    if (!changed || before === null) {
      throw AppError.notFound('Active member not found in this organization.');
    }
    await this.invalidator.invalidate(organizationId, userId);
    await this.audit.record({
      action: 'member.suspended',
      resource: 'organization_member',
      resourceId: userId,
      before: { status: before.status },
      after: { status: 'SUSPENDED' },
    });
  }
}
