// Unit tests for the pure permission decision logic (no DB).

import { describe, it, expect } from 'vitest';
import { decide } from './permission-check.js';

const set = (...keys: string[]): ReadonlySet<string> => new Set(keys);

describe('decide', () => {
  it('grants a directly held permission (not own-only)', () => {
    expect(decide('org.read', set('org.read'))).toEqual({ allowed: true, ownOnly: false });
  });

  it('grants via *_own and marks ownOnly for read/update/delete', () => {
    expect(decide('leads.read', set('leads.read_own'))).toEqual({ allowed: true, ownOnly: true });
    expect(decide('leads.update', set('leads.update_own'))).toEqual({ allowed: true, ownOnly: true });
    expect(decide('deals.delete', set('deals.delete_own'))).toEqual({ allowed: true, ownOnly: true });
  });

  it('prefers the full permission over the own variant (ownOnly false)', () => {
    expect(decide('leads.read', set('leads.read', 'leads.read_own'))).toEqual({
      allowed: true,
      ownOnly: false,
    });
  });

  it('does not own-scope non-own-scopable actions (create/assign/export)', () => {
    expect(decide('leads.create', set('leads.create_own')).allowed).toBe(false);
    expect(decide('leads.assign', set('leads.assign_own')).allowed).toBe(false);
  });

  it('denies when neither the permission nor its own variant is held', () => {
    expect(decide('team.update_role', set('team.read'))).toEqual({ allowed: false, ownOnly: false });
    expect(decide('org.read', set())).toEqual({ allowed: false, ownOnly: false });
  });

  it('handles admin keys that are not resource.action shaped', () => {
    expect(decide('team.suspend', set('team.suspend'))).toEqual({ allowed: true, ownOnly: false });
    expect(decide('team.suspend', set('team.read'))).toEqual({ allowed: false, ownOnly: false });
  });
});
