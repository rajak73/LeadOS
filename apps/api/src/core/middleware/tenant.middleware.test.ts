// Unit tests for the real tenantMiddleware (no DB/Redis — fake validator).

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createTenantMiddleware } from './tenant.middleware.js';
import { getTenantContext } from '../tenancy/context.js';
import { AppError } from '../errors/app-error.js';
import type { MembershipValidator } from '../tenancy/membership.js';

const res = {} as Response;
const auth = { userId: 'u1', organizationId: 'o1', role: 'OWNER', isSuperAdmin: false };

function validator(impl: MembershipValidator['isActiveMember']): MembershipValidator {
  return { isActiveMember: impl };
}

describe('tenantMiddleware', () => {
  it('passes through unauthenticated requests (no auth, no context)', async () => {
    const isActiveMember = vi.fn();
    const mw = createTenantMiddleware(validator(isActiveMember));
    const next = vi.fn();

    mw({} as Request, res, next);
    await Promise.resolve();

    expect(next).toHaveBeenCalledWith(); // no error
    expect(isActiveMember).not.toHaveBeenCalled();
  });

  it('sets the tenant context and calls next() for an active member', async () => {
    const mw = createTenantMiddleware(validator(() => Promise.resolve(true)));
    let ctxOrg: string | undefined;
    const next = vi.fn(() => {
      ctxOrg = getTenantContext()?.organizationId;
    });

    mw({ auth } as Request, res, next);
    await new Promise((r) => setTimeout(r, 0));

    expect(next).toHaveBeenCalledWith();
    expect(ctxOrg).toBe('o1');
  });

  it('rejects a non-member with a 403 AppError', async () => {
    const mw = createTenantMiddleware(validator(() => Promise.resolve(false)));
    const next = vi.fn();

    mw({ auth } as Request, res, next);
    await new Promise((r) => setTimeout(r, 0));

    const err = next.mock.calls[0]?.[0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
  });

  it('forwards a validator error to next()', async () => {
    const boom = new Error('db down');
    const mw = createTenantMiddleware(validator(() => Promise.reject(boom)));
    const next = vi.fn();

    mw({ auth } as Request, res, next);
    await new Promise((r) => setTimeout(r, 0));

    expect(next).toHaveBeenCalledWith(boom);
  });
});
