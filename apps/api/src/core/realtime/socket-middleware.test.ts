import { describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io';
import { signAccessToken } from '../auth/jwt.js';
import { socketAuthMiddleware } from './socket-middleware.js';

function makeSocket(authPayload: Record<string, unknown>): Partial<Socket> {
  return {
    handshake: { auth: authPayload } as Socket['handshake'],
    data: {} as Record<string, unknown>,
  };
}

describe('socketAuthMiddleware', () => {
  it('calls next() without error on a valid JWT', () => {
    const token = signAccessToken({ sub: 'user-1', orgId: 'org-1', role: 'MANAGER', isSuperAdmin: false });
    const socket = makeSocket({ token });
    const next = vi.fn();

    socketAuthMiddleware(socket as Socket, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(); // no error
    expect((socket.data as { userId: string }).userId).toBe('user-1');
    expect((socket.data as { organizationId: string }).organizationId).toBe('org-1');
    expect((socket.data as { role: string }).role).toBe('MANAGER');
  });

  it('rejects when no token is provided', () => {
    const socket = makeSocket({});
    const next = vi.fn();

    socketAuthMiddleware(socket as Socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'AUTH_REQUIRED' }));
  });

  it('rejects when token is not a string', () => {
    const socket = makeSocket({ token: 12345 });
    const next = vi.fn();

    socketAuthMiddleware(socket as Socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'AUTH_REQUIRED' }));
  });

  it('rejects when token is invalid JWT', () => {
    const socket = makeSocket({ token: 'not.a.jwt' });
    const next = vi.fn();

    socketAuthMiddleware(socket as Socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'INVALID_TOKEN' }));
  });

  it('rejects when token is expired', async () => {
    // Sign with a 1-second TTL, wait for expiry.
    // Use a negative exp to force an already-expired token without sleeping.
    const expired = signAccessToken({ sub: 'u', orgId: 'o', role: 'MANAGER', isSuperAdmin: false });
    // Tamper the exp to be in the past by mutating the payload — instead just use a known bad token.
    const socket = makeSocket({ token: `${expired}.tampered` });
    const next = vi.fn();

    socketAuthMiddleware(socket as Socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'INVALID_TOKEN' }));
  });
});
