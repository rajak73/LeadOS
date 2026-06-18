// In-memory AuthRepository for unit tests — lets the auth service be tested without a DB.
// Mirrors the contract of the Prisma implementation (atomic bootstrap, token lifecycle).

import { randomUUID } from 'node:crypto';
import type {
  AuthRepository,
  BootstrapParams,
  BootstrapResult,
  CreateRefreshTokenParams,
  MembershipRecord,
  RefreshTokenRecord,
  SessionRecord,
  UserRecord,
  VerificationTokenRecord,
} from '../../src/modules/auth/auth.repository.js';

interface StoredUser extends UserRecord {}
interface StoredToken {
  id: string;
  userId: string;
  type: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export class InMemoryAuthRepository implements AuthRepository {
  users = new Map<string, StoredUser>(); // by id
  private emailIndex = new Map<string, string>(); // email -> id
  slugs = new Set<string>();
  tokens: StoredToken[] = [];
  organizations = new Map<string, { id: string; slug: string }>();
  members: { organizationId: string; userId: string; roleId: string }[] = [];
  memberships: (MembershipRecord & { userId: string })[] = [];
  refreshTokens: (CreateRefreshTokenParams & {
    id: string;
    usedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  })[] = [];

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const id = this.emailIndex.get(email);
    return id ? (this.users.get(id) ?? null) : null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    return this.slugs.has(slug);
  }

  async bootstrapOrganization(params: BootstrapParams): Promise<BootstrapResult> {
    const userId = randomUUID();
    const organizationId = randomUUID();
    const ownerRoleId = randomUUID();
    this.users.set(userId, {
      id: userId,
      email: params.email,
      passwordHash: params.passwordHash,
      firstName: params.firstName,
      lastName: params.lastName,
      emailVerifiedAt: null,
      status: 'ACTIVE',
      isSuperAdmin: false,
      failedLoginCount: 0,
      lockedUntil: null,
    });
    this.emailIndex.set(params.email, userId);
    this.organizations.set(organizationId, { id: organizationId, slug: params.slug });
    this.slugs.add(params.slug);
    this.members.push({ organizationId, userId, roleId: ownerRoleId });
    this.memberships.push({
      userId,
      organizationId,
      organizationName: params.organizationName,
      roleId: ownerRoleId,
      roleName: 'OWNER',
    });
    return { userId, organizationId, ownerRoleId };
  }

  async getActiveMemberships(userId: string): Promise<MembershipRecord[]> {
    return this.memberships
      .filter((m) => m.userId === userId)
      .map(({ userId: _u, ...rest }) => rest);
  }

  async incrementFailedLogin(userId: string): Promise<number> {
    const u = this.users.get(userId);
    if (!u) return 0;
    u.failedLoginCount += 1;
    return u.failedLoginCount;
  }

  async lockUser(userId: string, until: Date): Promise<void> {
    const u = this.users.get(userId);
    if (u) u.lockedUntil = until;
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    const u = this.users.get(userId);
    if (u) {
      u.failedLoginCount = 0;
      u.lockedUntil = null;
    }
  }

  async createRefreshToken(params: CreateRefreshTokenParams): Promise<void> {
    this.refreshTokens.push({
      ...params,
      id: randomUUID(),
      usedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const t = this.refreshTokens.find((x) => x.tokenHash === tokenHash);
    if (!t) return null;
    return {
      id: t.id,
      userId: t.userId,
      organizationId: t.organizationId,
      family: t.family,
      expiresAt: t.expiresAt,
      usedAt: t.usedAt,
      revokedAt: t.revokedAt,
    };
  }

  async markRefreshTokenUsed(id: string): Promise<void> {
    const t = this.refreshTokens.find((x) => x.id === id);
    if (t) t.usedAt = new Date();
  }

  async revokeRefreshTokenFamily(family: string): Promise<void> {
    for (const t of this.refreshTokens) if (t.family === family && !t.revokedAt) t.revokedAt = new Date();
  }

  async getMembershipRole(userId: string, organizationId: string): Promise<string | null> {
    return (
      this.memberships.find((m) => m.userId === userId && m.organizationId === organizationId)
        ?.roleName ?? null
    );
  }

  async listSessions(userId: string): Promise<SessionRecord[]> {
    return this.refreshTokens
      .filter((t) => t.userId === userId && !t.revokedAt && t.expiresAt > new Date())
      .map((t) => ({
        id: t.id,
        deviceInfo: t.deviceInfo ?? null,
        ipAddress: t.ipAddress ?? null,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
      }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    const t = this.refreshTokens.find((x) => x.id === sessionId && x.userId === userId && !x.revokedAt);
    if (!t) return false;
    t.revokedAt = new Date();
    return true;
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    for (const t of this.refreshTokens) if (t.userId === userId && !t.revokedAt) t.revokedAt = new Date();
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    const u = this.users.get(userId);
    if (u) u.passwordHash = passwordHash;
  }

  /** Test helper: mark a user's email verified directly. */
  setVerified(userId: string): void {
    const u = this.users.get(userId);
    if (u) u.emailVerifiedAt = new Date();
  }

  async createVerificationToken(
    userId: string,
    type: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    this.tokens.push({ id: randomUUID(), userId, type, tokenHash, expiresAt, usedAt: null });
  }

  async findValidVerificationToken(
    tokenHash: string,
    type: string,
  ): Promise<VerificationTokenRecord | null> {
    const t = this.tokens.find(
      (x) => x.tokenHash === tokenHash && x.type === type && x.usedAt === null && x.expiresAt > new Date(),
    );
    return t ? { id: t.id, userId: t.userId, expiresAt: t.expiresAt } : null;
  }

  async consumeVerificationToken(id: string): Promise<void> {
    const t = this.tokens.find((x) => x.id === id);
    if (t) t.usedAt = new Date();
  }

  async markEmailVerified(userId: string): Promise<void> {
    const u = this.users.get(userId);
    if (u) u.emailVerifiedAt = new Date();
  }
}

export class CapturingEmailSender {
  verifications: { to: string; url: string }[] = [];
  resets: { to: string; url: string }[] = [];
  async sendVerificationEmail(to: string, url: string): Promise<void> {
    this.verifications.push({ to, url });
  }
  async sendPasswordResetEmail(to: string, url: string): Promise<void> {
    this.resets.push({ to, url });
  }
}
