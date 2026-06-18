import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from './auth.service.js';
import { verifyAccessToken } from '../../core/auth/jwt.js';
import { hashRefreshToken } from '../../core/auth/tokens.js';
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

async function setupVerifiedUser() {
  const repo = new InMemoryAuthRepository();
  const service = new AuthService(repo, new CapturingEmailSender());
  const { userId } = await service.register(reg);
  repo.setVerified(userId);
  return { repo, service, userId };
}

describe('AuthService.login', () => {
  let repo: InMemoryAuthRepository;
  let service: AuthService;

  beforeEach(async () => {
    ({ repo, service } = await setupVerifiedUser());
  });

  it('issues a valid access token + refresh token on correct credentials', async () => {
    const res = await service.login({ email: reg.email, password: reg.password, rememberMe: false });
    const claims = verifyAccessToken(res.accessToken);
    expect(claims.sub).toBeTruthy();
    expect(claims.role).toBe('OWNER');
    expect(claims.orgId).toBe(res.organization.id);
    // Refresh token stored hashed, not raw.
    expect(repo.refreshTokens[0]?.tokenHash).toBe(hashRefreshToken(res.refreshToken));
    expect(res.user.emailVerified).toBe(true);
  });

  it('rejects a wrong password and increments the failed counter', async () => {
    await expect(
      service.login({ email: reg.email, password: 'Wr0ng!Pass', rememberMe: false }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const user = await repo.findUserByEmail(reg.email);
    expect(user?.failedLoginCount).toBe(1);
  });

  it('locks the account after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await service.login({ email: reg.email, password: 'bad', rememberMe: false }).catch(() => {});
    }
    const user = await repo.findUserByEmail(reg.email);
    expect(user?.lockedUntil).toBeInstanceOf(Date);
    // Even a correct password is rejected while locked.
    await expect(
      service.login({ email: reg.email, password: reg.password, rememberMe: false }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('resets the failed counter on successful login', async () => {
    await service.login({ email: reg.email, password: 'bad', rememberMe: false }).catch(() => {});
    await service.login({ email: reg.email, password: reg.password, rememberMe: false });
    const user = await repo.findUserByEmail(reg.email);
    expect(user?.failedLoginCount).toBe(0);
  });

  it('returns a generic error for an unknown email (no enumeration)', async () => {
    await expect(
      service.login({ email: 'nobody@nowhere.com', password: 'whatever', rememberMe: false }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects login when the email is not verified', async () => {
    const r = new InMemoryAuthRepository();
    const s = new AuthService(r, new CapturingEmailSender());
    await s.register(reg); // not verified
    await expect(
      s.login({ email: reg.email, password: reg.password, rememberMe: false }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('honors rememberMe for a longer refresh expiry', async () => {
    const short = await service.login({ email: reg.email, password: reg.password, rememberMe: false });
    const long = await service.login({ email: reg.email, password: reg.password, rememberMe: true });
    expect(long.refreshTokenExpiresAt.getTime()).toBeGreaterThan(
      short.refreshTokenExpiresAt.getTime(),
    );
  });
});
