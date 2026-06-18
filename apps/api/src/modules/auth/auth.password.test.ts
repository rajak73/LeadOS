import { describe, it, expect } from 'vitest';
import { AuthService } from './auth.service.js';
import { verifyPassword } from '../../core/crypto/password.js';
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

async function setup() {
  const repo = new InMemoryAuthRepository();
  const email = new CapturingEmailSender();
  const service = new AuthService(repo, email);
  const { userId } = await service.register(reg);
  repo.setVerified(userId);
  return { repo, email, service, userId };
}

describe('AuthService.forgotPassword', () => {
  it('is a silent no-op for unknown emails (no enumeration)', async () => {
    const { service, email } = await setup();
    await service.forgotPassword('nobody@nowhere.com');
    expect(email.resets).toHaveLength(0);
  });

  it('issues a reset email for a known user', async () => {
    const { service, email } = await setup();
    await service.forgotPassword(reg.email);
    expect(email.resets).toHaveLength(1);
    expect(email.resets[0]?.to).toBe(reg.email);
  });
});

describe('AuthService.resetPassword', () => {
  it('changes the password, invalidates the token, and revokes all sessions', async () => {
    const { service, email, repo, userId } = await setup();
    // An active session exists.
    await service.login({ email: reg.email, password: reg.password, rememberMe: false });
    expect((await service.listSessions(userId)).length).toBe(1);

    await service.forgotPassword(reg.email);
    const raw = new URL(email.resets[0]!.url).searchParams.get('token')!;

    await service.resetPassword(raw, 'N3w!Strong');

    const user = await repo.findUserByEmail(reg.email);
    expect(await verifyPassword('N3w!Strong', user!.passwordHash)).toBe(true);
    expect(await verifyPassword('Str0ng!Pass', user!.passwordHash)).toBe(false);
    // All sessions revoked on password change.
    expect(await service.listSessions(userId)).toHaveLength(0);
    // Token is single-use.
    await expect(service.resetPassword(raw, 'An0ther!Pw')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects an unknown reset token', async () => {
    const { service } = await setup();
    await expect(service.resetPassword('bad', 'N3w!Strong')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('a verification (email) token cannot be used as a reset token', async () => {
    const { service, repo, userId } = await setup();
    // Create an email-verification token and try to use it for reset.
    const repoAny = repo;
    await repoAny.createVerificationToken(userId, 'EMAIL_VERIFICATION', 'somehash', new Date(Date.now() + 1e6));
    await expect(service.resetPassword('somehash', 'N3w!Strong')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('AuthService.getMe', () => {
  it('returns the profile with organizations', async () => {
    const { service, userId } = await setup();
    const me = await service.getMe(userId);
    expect(me.email).toBe(reg.email);
    expect(me.emailVerified).toBe(true);
    expect(me.organizations).toHaveLength(1);
    expect(me.organizations[0]?.role).toBe('OWNER');
  });

  it('throws NOT_FOUND for an unknown user', async () => {
    const { service } = await setup();
    await expect(service.getMe('missing-id')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
