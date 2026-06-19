// Unit tests for createRequirePermission (no DB — fake resolver).

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createRequirePermission } from './rbac.middleware.js';
import { runWithTenantContext, type TenantContext } from '../tenancy/context.js';
import { AppError } from '../errors/app-error.js';
import type { PermissionResolver, ResolvedPermissions } from '../authz/permission-check.js';

const res = {} as Response;
const auth = { userId: 'u1', organizationId: 'o1', role: 'MANAGER', isSuperAdmin: false };

function resolver(result: ResolvedPermissions | null, throws = false): PermissionResolver {
  return {
    resolve: throws ? () => Promise.reject(new Error('boom')) : () => Promise.resolve(result),
    invalidate: vi.fn().mockResolvedValue(undefined),
  };
}

function ctx(): TenantContext {
  return { organizationId: 'o1', userId: 'u1', role: 'MANAGER', isSuperAdmin: false };
}

/** Run the guard inside a tenant context and resolve once next() is called. */
function run(
  mw: ReturnType<ReturnType<typeof createRequirePermission>>,
  req: Request,
  context: TenantContext | null,
): Promise<unknown> {
  return new Promise((resolve) => {
    const invoke = () => mw(req, res, (err?: unknown) => resolve(err));
    if (context) runWithTenantContext(context, invoke);
    else invoke();
  });
}

describe('createRequirePermission', () => {
  it('401s when there is no authenticated user', async () => {
    const mw = createRequirePermission(resolver(null))('org.read');
    const err = await run(mw, {} as Request, null);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(401);
  });

  it('allows a member holding the permission and records permissions + ownOnly=false', async () => {
    const c = ctx();
    const mw = createRequirePermission(
      resolver({ roleName: 'MANAGER', permissions: new Set(['org.read']) }),
    )('org.read');
    const err = await run(mw, { auth } as Request, c);
    expect(err).toBeUndefined();
    expect(c.ownOnly).toBe(false);
    expect(c.permissions).toContain('org.read');
  });

  it('grants via *_own and sets ownOnly=true', async () => {
    const c = ctx();
    const mw = createRequirePermission(
      resolver({ roleName: 'SALES_EXECUTIVE', permissions: new Set(['leads.read_own']) }),
    )('leads.read');
    const err = await run(mw, { auth } as Request, c);
    expect(err).toBeUndefined();
    expect(c.ownOnly).toBe(true);
  });

  it('403s a member missing the permission', async () => {
    const mw = createRequirePermission(
      resolver({ roleName: 'SALES_EXECUTIVE', permissions: new Set(['org.read']) }),
    )('team.update_role');
    const err = await run(mw, { auth } as Request, ctx());
    expect((err as AppError).statusCode).toBe(403);
  });

  it('403s when the resolver finds no active membership', async () => {
    const mw = createRequirePermission(resolver(null))('org.read');
    const err = await run(mw, { auth } as Request, ctx());
    expect((err as AppError).statusCode).toBe(403);
  });

  it('bypasses checks for a super admin', async () => {
    const mw = createRequirePermission(resolver(null))('org.delete');
    const err = await run(mw, { auth: { ...auth, isSuperAdmin: true } } as Request, ctx());
    expect(err).toBeUndefined();
  });

  it('forwards a resolver error', async () => {
    const mw = createRequirePermission(resolver(null, true))('org.read');
    const err = await run(mw, { auth } as Request, ctx());
    expect(err).toBeInstanceOf(Error);
  });
});
