import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from './auth.service.js';
import { verifyPassword } from '../../core/crypto/password.js';
import { hashVerificationToken } from '../../core/auth/tokens.js';
import {
  InMemoryAuthRepository,
  CapturingEmailSender,
} from '../../../tests/helpers/in-memory-auth-repo.js';

const validInput = {
  email: 'arjun@acme.com',
  password: 'Str0ng!Pass',
  firstName: 'Arjun',
  lastName: 'Shah',
  organizationName: 'Acme Agency',
};

describe('AuthService.register', () => {
  let repo: InMemoryAuthRepository;
  let email: CapturingEmailSender;
  let service: AuthService;

  beforeEach(() => {
    repo = new InMemoryAuthRepository();
    email = new CapturingEmailSender();
    service = new AuthService(repo, email);
  });

  it('bootstraps a user + org and sends a verification email', async () => {
    const res = await service.register(validInput);
    expect(res.userId).toBeTruthy();
    expect(res.organizationId).toBeTruthy();
    expect(repo.users.size).toBe(1);
    expect(repo.members).toHaveLength(1);
    expect(email.verifications).toHaveLength(1);
    expect(email.verifications[0]?.to).toBe('arjun@acme.com');
  });

  it('stores a bcrypt hash, never the plaintext password', async () => {
    await service.register(validInput);
    const user = await repo.findUserByEmail('arjun@acme.com');
    expect(user?.passwordHash).not.toBe('Str0ng!Pass');
    expect(await verifyPassword('Str0ng!Pass', user!.passwordHash)).toBe(true);
  });

  it('generates a unique slug when the base is taken', async () => {
    repo.slugs.add('acme-agency');
    await service.register(validInput);
    expect([...repo.organizations.values()][0]?.slug).toBe('acme-agency-2');
  });

  it('rejects a duplicate email with CONFLICT', async () => {
    await service.register(validInput);
    await expect(service.register(validInput)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('the user starts unverified', async () => {
    await service.register(validInput);
    const user = await repo.findUserByEmail('arjun@acme.com');
    expect(user?.emailVerifiedAt).toBeNull();
  });
});

describe('AuthService.verifyEmail', () => {
  it('verifies with a valid token and rejects reuse', async () => {
    const repo = new InMemoryAuthRepository();
    const email = new CapturingEmailSender();
    const service = new AuthService(repo, email);
    await service.register(validInput);

    // Reconstruct the raw token from the captured URL.
    const url = email.verifications[0]!.url;
    const raw = new URL(url).searchParams.get('token')!;

    await service.verifyEmail(raw);
    const user = await repo.findUserByEmail('arjun@acme.com');
    expect(user?.emailVerifiedAt).not.toBeNull();

    // Token is single-use.
    await expect(service.verifyEmail(raw)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects an unknown token', async () => {
    const service = new AuthService(new InMemoryAuthRepository(), new CapturingEmailSender());
    await expect(service.verifyEmail('nope')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('stores the token hashed, not in plaintext', async () => {
    const repo = new InMemoryAuthRepository();
    const email = new CapturingEmailSender();
    await new AuthService(repo, email).register(validInput);
    const raw = new URL(email.verifications[0]!.url).searchParams.get('token')!;
    expect(repo.tokens[0]?.tokenHash).toBe(hashVerificationToken(raw));
    expect(repo.tokens[0]?.tokenHash).not.toBe(raw);
  });
});

describe('AuthService.resendVerification', () => {
  it('is a silent no-op for unknown emails (no enumeration)', async () => {
    const repo = new InMemoryAuthRepository();
    const email = new CapturingEmailSender();
    const service = new AuthService(repo, email);
    await service.resendVerification('nobody@nowhere.com');
    expect(email.verifications).toHaveLength(0);
  });

  it('re-issues for a known unverified user', async () => {
    const repo = new InMemoryAuthRepository();
    const email = new CapturingEmailSender();
    const service = new AuthService(repo, email);
    await service.register(validInput);
    await service.resendVerification('arjun@acme.com');
    expect(email.verifications.length).toBeGreaterThanOrEqual(2);
  });
});
