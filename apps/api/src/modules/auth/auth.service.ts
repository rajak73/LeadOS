// Auth service — registration + email verification (Sprint 2, M2).
// Depends on the AuthRepository + EmailSender INTERFACES (constructor injection) so it is
// fully unit-testable without a database or real email delivery.

import { randomUUID } from 'node:crypto';
import { ErrorCode } from '@leados/shared';
import { AppError } from '../../core/errors/app-error.js';
import { hashPassword, verifyPassword } from '../../core/crypto/password.js';
import { generateToken, hashVerificationToken, hashRefreshToken } from '../../core/auth/tokens.js';
import { signAccessToken } from '../../core/auth/jwt.js';
import { logger } from '../../core/observability/logger.js';
import { env } from '../../core/config/env.js';
import { uniqueSlug } from './slug.js';
import type { AuthRepository, SessionRecord } from './auth.repository.js';
import type { EmailSender } from './email.js';
import type { RegisterInput, LoginInput } from '@leados/shared';

const TRIAL_DAYS = 14;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 min
// Precomputed bcrypt hash of a random string — compared against when a user is not found,
// to equalize response timing (mitigates user-enumeration via timing).
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO3Q6cVQ2gQ8m6Yx6m6Yx6m6Yx6m6Yx6';

export interface RegisterResult {
  userId: string;
  organizationId: string;
}

export interface LoginResult {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: { id: string; email: string; firstName: string; lastName: string; emailVerified: boolean };
  organization: { id: string; role: string };
  organizations: { id: string; name: string; role: string }[];
}

export interface LoginContext {
  deviceInfo?: string | undefined;
  ipAddress?: string | undefined;
}

export interface RefreshResult {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface MeResult {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  isSuperAdmin: boolean;
  organizations: { id: string; name: string; role: string }[];
}

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly email: EmailSender,
  ) {}

  async register(input: RegisterInput): Promise<RegisterResult> {
    const existing = await this.repo.findUserByEmail(input.email);
    if (existing) {
      throw new AppError(ErrorCode.CONFLICT, 'An account with this email already exists');
    }

    const passwordHash = await hashPassword(input.password);
    const slug = await uniqueSlug(input.organizationName, (s) => this.repo.isSlugTaken(s));

    const { userId, organizationId } = await this.repo.bootstrapOrganization({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      organizationName: input.organizationName,
      slug,
      trialDays: TRIAL_DAYS,
    });

    await this.issueVerificationEmail(userId, input.email);
    return { userId, organizationId };
  }

  async login(input: LoginInput, ctx: LoginContext = {}): Promise<LoginResult> {
    const user = await this.repo.findUserByEmail(input.email);

    // Timing-equalized credential check; generic error to avoid user enumeration.
    if (!user) {
      await verifyPassword(input.password, DUMMY_HASH);
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Invalid email or password');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(ErrorCode.RATE_LIMITED, 'Account temporarily locked. Try again later.');
    }

    const passwordOk = await verifyPassword(input.password, user.passwordHash);
    if (!passwordOk) {
      const count = await this.repo.incrementFailedLogin(user.id);
      if (count >= MAX_FAILED_LOGINS) {
        await this.repo.lockUser(user.id, new Date(Date.now() + LOCKOUT_MS));
      }
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError(ErrorCode.FORBIDDEN, 'This account is not active');
    }
    if (!user.emailVerifiedAt) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Please verify your email before signing in');
    }

    const memberships = await this.repo.getActiveMemberships(user.id);
    if (memberships.length === 0) {
      throw new AppError(ErrorCode.FORBIDDEN, 'This account has no active organization');
    }
    // Single-org issue: token for the first (oldest) membership. Multi-org switching is a
    // follow-up; all orgs are returned so the UI is aware.
    const primary = memberships[0]!;

    await this.repo.recordSuccessfulLogin(user.id);

    const accessToken = signAccessToken({
      sub: user.id,
      orgId: primary.organizationId,
      role: primary.roleName,
      isSuperAdmin: user.isSuperAdmin,
    });

    const rawRefresh = generateToken(48);
    const ttlDays = input.rememberMe ? env.REFRESH_TOKEN_REMEMBER_TTL_DAYS : env.REFRESH_TOKEN_TTL_DAYS;
    const refreshTokenExpiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await this.repo.createRefreshToken({
      userId: user.id,
      organizationId: primary.organizationId,
      tokenHash: hashRefreshToken(rawRefresh),
      family: randomUUID(),
      deviceInfo: ctx.deviceInfo,
      ipAddress: ctx.ipAddress,
      expiresAt: refreshTokenExpiresAt,
    });

    return {
      accessToken,
      accessTokenExpiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: rawRefresh,
      refreshTokenExpiresAt,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: true,
      },
      organization: { id: primary.organizationId, role: primary.roleName },
      organizations: memberships.map((m) => ({
        id: m.organizationId,
        name: m.organizationName,
        role: m.roleName,
      })),
    };
  }

  /**
   * Rotate a refresh token. Detects family-reuse attacks (a token presented after it was
   * already used) → revokes the entire family and rejects (doc 19 §19.1).
   */
  async refresh(rawToken: string, ctx: LoginContext = {}): Promise<RefreshResult> {
    const record = await this.repo.findRefreshTokenByHash(hashRefreshToken(rawToken));
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Invalid or expired session');
    }

    // Reuse of an already-used token → token family compromise.
    if (record.usedAt) {
      await this.repo.revokeRefreshTokenFamily(record.family);
      logger.warn({
        message: 'auth.refresh.reuse_detected',
        userId: record.userId,
        family: record.family,
      });
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Session reuse detected; please sign in again');
    }

    await this.repo.markRefreshTokenUsed(record.id);

    const role = await this.repo.getMembershipRole(record.userId, record.organizationId);
    const user = await this.repo.findUserById(record.userId);
    if (!role || !user || user.status !== 'ACTIVE') {
      await this.repo.revokeRefreshTokenFamily(record.family);
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Session no longer valid');
    }

    const accessToken = signAccessToken({
      sub: user.id,
      orgId: record.organizationId,
      role,
      isSuperAdmin: user.isSuperAdmin,
    });

    const rawRefresh = generateToken(48);
    const refreshTokenExpiresAt = new Date(
      Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.repo.createRefreshToken({
      userId: user.id,
      organizationId: record.organizationId,
      tokenHash: hashRefreshToken(rawRefresh),
      family: record.family, // same family across the rotation chain
      deviceInfo: ctx.deviceInfo,
      ipAddress: ctx.ipAddress,
      expiresAt: refreshTokenExpiresAt,
    });

    return {
      accessToken,
      accessTokenExpiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: rawRefresh,
      refreshTokenExpiresAt,
    };
  }

  /** Revoke the presented session's token (idempotent). */
  async logout(rawToken: string): Promise<void> {
    const record = await this.repo.findRefreshTokenByHash(hashRefreshToken(rawToken));
    if (record && !record.revokedAt) {
      await this.repo.revokeSession(record.userId, record.id);
    }
  }

  async listSessions(userId: string): Promise<SessionRecord[]> {
    return this.repo.listSessions(userId);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const ok = await this.repo.revokeSession(userId, sessionId);
    if (!ok) throw new AppError(ErrorCode.NOT_FOUND, 'Session not found');
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.repo.revokeAllUserSessions(userId);
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.repo.findValidVerificationToken(
      hashVerificationToken(token),
      'EMAIL_VERIFICATION',
    );
    if (!record) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid or expired verification token');
    }
    await this.repo.consumeVerificationToken(record.id);
    await this.repo.markEmailVerified(record.userId);
  }

  /** Request a password reset. Generic (no enumeration) — always resolves. */
  async forgotPassword(emailAddress: string): Promise<void> {
    const user = await this.repo.findUserByEmail(emailAddress);
    if (!user) return; // silent no-op
    const raw = generateToken(32);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h (doc 19)
    await this.repo.createVerificationToken(
      user.id,
      'PASSWORD_RESET',
      hashVerificationToken(raw),
      expiresAt,
    );
    const resetUrl = `${env.APP_WEB_ORIGIN}/reset-password?token=${raw}`;
    await this.email.sendPasswordResetEmail(emailAddress, resetUrl);
  }

  /** Reset the password with a single-use token, then revoke ALL sessions (doc 19 §19.1). */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.repo.findValidVerificationToken(
      hashVerificationToken(token),
      'PASSWORD_RESET',
    );
    if (!record) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid or expired reset token');
    }
    await this.repo.updatePassword(record.userId, await hashPassword(newPassword));
    await this.repo.consumeVerificationToken(record.id);
    await this.repo.revokeAllUserSessions(record.userId);
  }

  async getMe(userId: string): Promise<MeResult> {
    const user = await this.repo.findUserById(userId);
    if (!user) throw new AppError(ErrorCode.NOT_FOUND, 'User not found');
    const memberships = await this.repo.getActiveMemberships(userId);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      emailVerified: user.emailVerifiedAt !== null,
      isSuperAdmin: user.isSuperAdmin,
      organizations: memberships.map((m) => ({
        id: m.organizationId,
        name: m.organizationName,
        role: m.roleName,
      })),
    };
  }

  /** Resend verification. Responds the same whether or not the email exists (no enumeration). */
  async resendVerification(emailAddress: string): Promise<void> {
    const user = await this.repo.findUserByEmail(emailAddress);
    if (!user || user.emailVerifiedAt) return; // silent no-op
    await this.issueVerificationEmail(user.id, emailAddress);
  }

  private async issueVerificationEmail(userId: string, emailAddress: string): Promise<void> {
    const raw = generateToken(32);
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
    await this.repo.createVerificationToken(
      userId,
      'EMAIL_VERIFICATION',
      hashVerificationToken(raw),
      expiresAt,
    );
    const verifyUrl = `${env.APP_WEB_ORIGIN}/verify-email?token=${raw}`;
    await this.email.sendVerificationEmail(emailAddress, verifyUrl);
  }
}
