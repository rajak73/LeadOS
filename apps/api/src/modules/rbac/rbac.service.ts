// RBAC-2.3 + RBAC-2.4 — role administration with active cache invalidation.
//
// Any change to a member's role/status invalidates their cached permission + membership
// entries, so the next request re-resolves from the DB (closing the MT-2 / SEC-M2-2 staleness
// window). DI: repository + invalidator are injected for unit testing.

import { AppError } from '../../core/errors/app-error.js';
import type { RbacRepository, RoleSummary } from './rbac.repository.js';

/** Purges a member's cached permission + membership entries (RBAC-2.4). */
export interface MemberInvalidator {
  invalidate(organizationId: string, userId: string): Promise<void>;
}

export class RbacService {
  constructor(
    private readonly repo: RbacRepository,
    private readonly invalidator: MemberInvalidator,
  ) {}

  listRoles(organizationId: string): Promise<RoleSummary[]> {
    return this.repo.listRoles(organizationId);
  }

  async assignRole(organizationId: string, userId: string, roleId: string): Promise<void> {
    if (!(await this.repo.roleExists(organizationId, roleId))) {
      throw AppError.validation('Unknown role for this organization.');
    }
    const changed = await this.repo.assignRole(organizationId, userId, roleId);
    if (!changed) {
      throw AppError.notFound('Member not found in this organization.');
    }
    await this.invalidator.invalidate(organizationId, userId);
  }

  async suspendMember(organizationId: string, userId: string): Promise<void> {
    const changed = await this.repo.suspendMember(organizationId, userId);
    if (!changed) {
      throw AppError.notFound('Active member not found in this organization.');
    }
    await this.invalidator.invalidate(organizationId, userId);
  }
}
