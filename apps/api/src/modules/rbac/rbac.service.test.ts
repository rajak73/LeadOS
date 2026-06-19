// Unit tests for RbacService (no DB — fake repo + fake invalidator).

import { describe, it, expect, vi } from 'vitest';
import { RbacService, type MemberInvalidator } from './rbac.service.js';
import type { RbacRepository } from './rbac.repository.js';

function repo(overrides: Partial<RbacRepository> = {}): RbacRepository {
  return {
    listRoles: vi.fn().mockResolvedValue([]),
    roleExists: vi.fn().mockResolvedValue(true),
    assignRole: vi.fn().mockResolvedValue(true),
    suspendMember: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function invalidator(): MemberInvalidator & { invalidate: ReturnType<typeof vi.fn> } {
  return { invalidate: vi.fn().mockResolvedValue(undefined) };
}

describe('RbacService.assignRole', () => {
  it('assigns and invalidates the member cache on success', async () => {
    const inv = invalidator();
    await new RbacService(repo(), inv).assignRole('o1', 'u1', 'r1');
    expect(inv.invalidate).toHaveBeenCalledWith('o1', 'u1');
  });

  it('rejects an unknown role and does NOT invalidate', async () => {
    const inv = invalidator();
    const svc = new RbacService(repo({ roleExists: vi.fn().mockResolvedValue(false) }), inv);
    await expect(svc.assignRole('o1', 'u1', 'bad')).rejects.toThrow(/Unknown role/);
    expect(inv.invalidate).not.toHaveBeenCalled();
  });

  it('rejects when the member is not found and does NOT invalidate', async () => {
    const inv = invalidator();
    const svc = new RbacService(repo({ assignRole: vi.fn().mockResolvedValue(false) }), inv);
    await expect(svc.assignRole('o1', 'u1', 'r1')).rejects.toThrow(/Member not found/);
    expect(inv.invalidate).not.toHaveBeenCalled();
  });
});

describe('RbacService.suspendMember', () => {
  it('suspends and invalidates on success', async () => {
    const inv = invalidator();
    await new RbacService(repo(), inv).suspendMember('o1', 'u1');
    expect(inv.invalidate).toHaveBeenCalledWith('o1', 'u1');
  });

  it('rejects when no active member and does NOT invalidate', async () => {
    const inv = invalidator();
    const svc = new RbacService(repo({ suspendMember: vi.fn().mockResolvedValue(false) }), inv);
    await expect(svc.suspendMember('o1', 'u1')).rejects.toThrow(/Active member not found/);
    expect(inv.invalidate).not.toHaveBeenCalled();
  });
});

describe('RbacService.listRoles', () => {
  it('delegates to the repository', async () => {
    const roles = [{ id: 'r1', name: 'OWNER', isSystem: true }];
    const svc = new RbacService(repo({ listRoles: vi.fn().mockResolvedValue(roles) }), invalidator());
    expect(await svc.listRoles('o1')).toEqual(roles);
  });
});
