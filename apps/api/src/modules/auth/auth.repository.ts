// Auth data access. The service depends on this INTERFACE (so it is unit-testable with an
// in-memory fake); production wires the Prisma implementation. This module is the SOLE DB
// accessor for identity/org tables (module-boundary rule).
//
// NOTE on tenancy (Sprint 3 M3 / E3):
//   - Org-scoped operations with a KNOWN org (getMembershipRole, createRefreshToken) run through
//     withTenant + the tenant extension (TEN-3.2.2), via OrgScopedAuthRepository.
//   - PRE-TENANT / CROSS-TENANT IDENTITY operations stay on the raw client by design — they
//     either CREATE the tenant or DISCOVER it before any tenant context exists, so a single-org
//     scope does not apply. These are the documented exceptions (FINAL_ARCHITECTURE §2.4):
//       * bootstrapOrganization        — creates the org + its first rows (atomic, one tx)
//       * getActiveMemberships         — login membership discovery (across the user's orgs)
//       * findRefreshTokenByHash       — opaque-token lookup (org unknown until the row is read)
//       * markRefreshTokenUsed / revokeRefreshTokenFamily — keyed by the just-looked-up token
//       * listSessions / revokeSession / revokeAllUserSessions — per-USER across orgs
//   The runtime connection is still the admin role (D2); RLS turns on once it switches to
//   leados_app, after every tenant write is wrapped.

import { type PrismaClient, type VerificationTokenType } from '@prisma/client';
import { ROLE_PERMISSIONS, type SystemRole } from '@leados/shared';
import { withTenant } from '../../core/tenancy/with-tenant.js';
import { OrgScopedAuthRepository } from './org-scoped-auth.repository.js';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  emailVerifiedAt: Date | null;
  status: string;
  isSuperAdmin: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export interface BootstrapParams {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  slug: string;
  trialDays: number;
}

export interface BootstrapResult {
  userId: string;
  organizationId: string;
  ownerRoleId: string;
}

export interface VerificationTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface MembershipRecord {
  organizationId: string;
  organizationName: string;
  roleId: string;
  roleName: string;
}

export interface CreateRefreshTokenParams {
  userId: string;
  organizationId: string;
  tokenHash: string;
  family: string;
  deviceInfo?: string | undefined;
  ipAddress?: string | undefined;
  expiresAt: Date;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  organizationId: string;
  family: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

export interface SessionRecord {
  id: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  isSlugTaken(slug: string): Promise<boolean>;
  bootstrapOrganization(params: BootstrapParams): Promise<BootstrapResult>;
  createVerificationToken(
    userId: string,
    type: VerificationTokenType,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
  findValidVerificationToken(
    tokenHash: string,
    type: VerificationTokenType,
  ): Promise<VerificationTokenRecord | null>;
  consumeVerificationToken(id: string): Promise<void>;
  markEmailVerified(userId: string): Promise<void>;
  // Login (M3)
  getActiveMemberships(userId: string): Promise<MembershipRecord[]>;
  incrementFailedLogin(userId: string): Promise<number>;
  lockUser(userId: string, until: Date): Promise<void>;
  recordSuccessfulLogin(userId: string): Promise<void>;
  createRefreshToken(params: CreateRefreshTokenParams): Promise<void>;
  // Refresh rotation + sessions (M4)
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  markRefreshTokenUsed(id: string): Promise<void>;
  revokeRefreshTokenFamily(family: string): Promise<void>;
  getMembershipRole(userId: string, organizationId: string): Promise<string | null>;
  listSessions(userId: string): Promise<SessionRecord[]>;
  revokeSession(userId: string, sessionId: string): Promise<boolean>;
  revokeAllUserSessions(userId: string): Promise<void>;
  // Password reset (M5)
  updatePassword(userId: string, passwordHash: string): Promise<void>;
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: this.userSelect(),
    });
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id }, select: this.userSelect() });
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    const found = await this.prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    return found !== null;
  }

  /** Atomic org bootstrap (single transaction): user → org → roles+permissions → OWNER member → trial sub. */
  async bootstrapOrganization(params: BootstrapParams): Promise<BootstrapResult> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: params.email,
          passwordHash: params.passwordHash,
          firstName: params.firstName,
          lastName: params.lastName,
        },
        select: { id: true },
      });

      const organization = await tx.organization.create({
        data: { name: params.organizationName, slug: params.slug },
        select: { id: true },
      });

      // Seed the 4 system roles + their permission rows (data only; enforcement is S3).
      const roleIds: Record<SystemRole, string> = {} as Record<SystemRole, string>;
      for (const roleName of Object.keys(ROLE_PERMISSIONS) as SystemRole[]) {
        const role = await tx.role.create({
          data: { organizationId: organization.id, name: roleName, isSystem: true },
          select: { id: true },
        });
        roleIds[roleName] = role.id;
        const perms = ROLE_PERMISSIONS[roleName].map((key) => {
          const [resource, ...rest] = key.split('.');
          return { roleId: role.id, resource: resource ?? key, action: rest.join('.') };
        });
        if (perms.length > 0) {
          await tx.permission.createMany({ data: perms });
        }
      }

      await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          roleId: roleIds.OWNER,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });

      const trialEndsAt = new Date(Date.now() + params.trialDays * 24 * 60 * 60 * 1000);
      await tx.subscription.create({
        data: {
          organizationId: organization.id,
          plan: 'TRIAL',
          status: 'TRIALING',
          trialEndsAt,
        },
      });

      return { userId: user.id, organizationId: organization.id, ownerRoleId: roleIds.OWNER };
    });
  }

  async createVerificationToken(
    userId: string,
    type: VerificationTokenType,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.verificationToken.create({ data: { userId, type, tokenHash, expiresAt } });
  }

  async findValidVerificationToken(
    tokenHash: string,
    type: VerificationTokenType,
  ): Promise<VerificationTokenRecord | null> {
    const t = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true, type: true },
    });
    if (!t || t.type !== type || t.usedAt !== null || t.expiresAt < new Date()) return null;
    return { id: t.id, userId: t.userId, expiresAt: t.expiresAt };
  }

  async consumeVerificationToken(id: string): Promise<void> {
    await this.prisma.verificationToken.update({ where: { id }, data: { usedAt: new Date() } });
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  }

  async getActiveMemberships(userId: string): Promise<MembershipRecord[]> {
    const rows = await this.prisma.organizationMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: {
        organizationId: true,
        roleId: true,
        organization: { select: { name: true } },
        role: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      organizationId: r.organizationId,
      organizationName: r.organization.name,
      roleId: r.roleId,
      roleName: r.role.name,
    }));
  }

  async incrementFailedLogin(userId: string): Promise<number> {
    const u = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    return u.failedLoginCount;
  }

  async lockUser(userId: string, until: Date): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { lockedUntil: until } });
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  }

  // TEN-3.2.2 — org-scoped WRITE: the org is known, so this runs through withTenant + the
  // tenant extension (organizationId is injected — note the org-free create input).
  async createRefreshToken(params: CreateRefreshTokenParams): Promise<void> {
    await withTenant(params.organizationId, (db) =>
      new OrgScopedAuthRepository(db).createRefreshToken({
        userId: params.userId,
        tokenHash: params.tokenHash,
        family: params.family,
        deviceInfo: params.deviceInfo ?? null,
        ipAddress: params.ipAddress ?? null,
        expiresAt: params.expiresAt,
      }),
    );
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        family: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
      },
    });
  }

  async markRefreshTokenUsed(id: string): Promise<void> {
    await this.prisma.refreshToken.update({ where: { id }, data: { usedAt: new Date() } });
  }

  async revokeRefreshTokenFamily(family: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // TEN-3.2.2 — org-scoped READ: the org is known, so this runs through withTenant + the
  // tenant extension (the organizationId filter is injected automatically).
  async getMembershipRole(userId: string, organizationId: string): Promise<string | null> {
    return withTenant(organizationId, (db) => new OrgScopedAuthRepository(db).getMembershipRole(userId));
  }

  async listSessions(userId: string): Promise<SessionRecord[]> {
    return this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, deviceInfo: true, ipAddress: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  private userSelect() {
    return {
      id: true,
      email: true,
      passwordHash: true,
      firstName: true,
      lastName: true,
      emailVerifiedAt: true,
      status: true,
      isSuperAdmin: true,
      failedLoginCount: true,
      lockedUntil: true,
    } as const;
  }
}
