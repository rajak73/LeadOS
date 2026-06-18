import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from './auth.service.js';
import { verifyAccessToken } from '../../core/auth/jwt.js';
import {
  InMemoryAuthRepository,
  CapturingEmailSender,
} from '../../../tests/helpers/in-memory-auth-repo.js';

const reg = {
  email: 'arjun@acme.com',
  password: 'Str0ng!Pass',
  firstName: 'Arjun',
  lastName: 'Shah',
  organizationName: 'Acme Agency',
};

async function loggedIn() {
  const repo = new InMemoryAuthRepository();
  const service = new AuthService(repo, new CapturingEmailSender());
  const { userId } = await service.register(reg);
  repo.setVerified(userId);
  const session = await service.login({ email: reg.email, password: reg.password, rememberMe: false });
  return { repo, service, userId, session };
}

describe('AuthService.refresh — rotation', () => {
  let ctx: Awaited<ReturnType<typeof loggedIn>>;
  beforeEach(async () => {
    ctx = await loggedIn();
  });

  it('rotates: returns a new access + refresh and marks the old token used', async () => {
    const result = await ctx.service.refresh(ctx.session.refreshToken);
    expect(verifyAccessToken(result.accessToken).sub).toBeTruthy();
    expect(result.refreshToken).not.toBe(ctx.session.refreshToken);
    // The original token is now marked used.
    const used = ctx.repo.refreshTokens.find((t) => t.usedAt !== null);
    expect(used).toBeDefined();
  });

  it('keeps the same token family across rotation', async () => {
    const fam = ctx.repo.refreshTokens[0]!.family;
    await ctx.service.refresh(ctx.session.refreshToken);
    expect(ctx.repo.refreshTokens.every((t) => t.family === fam)).toBe(true);
  });
});

describe('AuthService.refresh — reuse detection', () => {
  it('revokes the whole family when an already-used token is replayed', async () => {
    const { repo, service, session } = await loggedIn();
    const rotated = await service.refresh(session.refreshToken); // rt1 -> rt2

    // Replay rt1 (already used) → reuse attack.
    await expect(service.refresh(session.refreshToken)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    // The family is revoked, so the legitimately-rotated rt2 is now dead too.
    expect(repo.refreshTokens.every((t) => t.revokedAt !== null)).toBe(true);
    await expect(service.refresh(rotated.refreshToken)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects an unknown refresh token', async () => {
    const { service } = await loggedIn();
    await expect(service.refresh('not-a-real-token')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('AuthService — sessions + logout', () => {
  it('lists active sessions and revokes one', async () => {
    const { repo, service, userId, session } = await loggedIn();
    await service.login({ email: reg.email, password: reg.password, rememberMe: false }); // 2nd session
    let sessions = await service.listSessions(userId);
    expect(sessions.length).toBe(2);

    await service.revokeSession(userId, sessions[0]!.id);
    sessions = await service.listSessions(userId);
    expect(sessions.length).toBe(1);

    // Revoking another user's / unknown session id → NOT_FOUND.
    await expect(service.revokeSession(userId, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.refreshTokens.length).toBeGreaterThan(0);
    expect(session.refreshToken).toBeTruthy();
  });

  it('logout revokes the presented session (idempotent)', async () => {
    const { service, userId, session } = await loggedIn();
    await service.logout(session.refreshToken);
    expect(await service.listSessions(userId)).toHaveLength(0);
    await service.logout(session.refreshToken); // no throw on repeat
  });

  it('revokeAllSessions clears every session', async () => {
    const { service, userId } = await loggedIn();
    await service.login({ email: reg.email, password: reg.password, rememberMe: false });
    await service.revokeAllSessions(userId);
    expect(await service.listSessions(userId)).toHaveLength(0);
  });
});
