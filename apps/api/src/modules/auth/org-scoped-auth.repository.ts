// TEN-3.2.2 — org-scoped slice of the auth data layer, built on the tenant repository base.
//
// These are the auth operations that run INSIDE a known tenant (a member's current org), so
// they go through withTenant + the tenant extension: organizationId is injected automatically
// (note the org-free create — no organizationId, no cast at the call site; TD-M2-1 resolved),
// and the data is RLS-eligible once the runtime connects as leados_app (a later milestone).
//
// Pre-tenant / cross-tenant identity operations (bootstrap, login membership discovery, opaque
// token lookup, cross-org session listing) remain on the raw client in auth.repository.ts.

import type { Prisma } from '@prisma/client';
import {
  TenantRepository,
  asTenantCreate,
  type WithoutTenant,
} from '../../core/tenancy/tenant-repository.js';

export type OrgScopedRefreshTokenInput = WithoutTenant<Prisma.RefreshTokenUncheckedCreateInput>;

export class OrgScopedAuthRepository extends TenantRepository {
  /** Create a refresh token in the active org. organizationId is injected by the extension. */
  async createRefreshToken(data: OrgScopedRefreshTokenInput): Promise<void> {
    await this.db.refreshToken.create({
      data: asTenantCreate<Prisma.RefreshTokenUncheckedCreateInput>(data),
    });
  }

  /** The ACTIVE membership role name for a user in the active org (org-scoped read). */
  async getMembershipRole(userId: string): Promise<string | null> {
    const member = await this.db.organizationMember.findFirst({
      where: { userId, status: 'ACTIVE' },
      select: { role: { select: { name: true } } },
    });
    return member?.role.name ?? null;
  }
}
