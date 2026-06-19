// Unit tests for the tenant extension's pure injection logic (no DB). Covers the full
// operation matrix + deny-by-default.

import { describe, it, expect } from 'vitest';
import { injectTenant, TenantScopeError } from './tenant-extension.js';

const ORG = '11111111-1111-1111-1111-111111111111';

describe('injectTenant — create family', () => {
  it('sets organizationId on create data (preserving other fields)', () => {
    const out = injectTenant('create', { data: { name: 'X' } }, ORG);
    expect(out.data).toEqual({ name: 'X', organizationId: ORG });
  });

  it('sets organizationId on every row of createMany (array)', () => {
    const out = injectTenant('createMany', { data: [{ name: 'A' }, { name: 'B' }] }, ORG);
    expect(out.data).toEqual([
      { name: 'A', organizationId: ORG },
      { name: 'B', organizationId: ORG },
    ]);
  });

  it('handles createMany with a single object', () => {
    const out = injectTenant('createMany', { data: { name: 'A' } }, ORG);
    expect(out.data).toEqual([{ name: 'A', organizationId: ORG }]);
  });

  it('scopes upsert where AND create', () => {
    const out = injectTenant('upsert', { where: { id: 'x' }, create: { name: 'N' }, update: {} }, ORG);
    expect(out.where).toEqual({ id: 'x', organizationId: ORG });
    expect(out.create).toEqual({ name: 'N', organizationId: ORG });
  });
});

describe('injectTenant — where family', () => {
  for (const op of [
    'findUnique',
    'findUniqueOrThrow',
    'findFirst',
    'findFirstOrThrow',
    'findMany',
    'update',
    'updateMany',
    'delete',
    'deleteMany',
    'count',
    'aggregate',
    'groupBy',
  ]) {
    it(`merges organizationId into where for ${op}`, () => {
      const out = injectTenant(op, { where: { name: 'X' } }, ORG);
      expect(out.where).toEqual({ name: 'X', organizationId: ORG });
    });
  }

  it('creates a where when none is provided (e.g. count/findMany with no filter)', () => {
    expect(injectTenant('findMany', {}, ORG).where).toEqual({ organizationId: ORG });
    expect(injectTenant('count', undefined, ORG).where).toEqual({ organizationId: ORG });
  });

  it('preserves a unique selector while adding the tenant filter (extendedWhereUnique)', () => {
    const out = injectTenant('findUnique', { where: { id: 'abc' } }, ORG);
    expect(out.where).toEqual({ id: 'abc', organizationId: ORG });
  });
});

describe('injectTenant — tenant cannot be escaped', () => {
  it('overrides a caller-supplied organizationId in where', () => {
    const out = injectTenant('findMany', { where: { organizationId: 'other-org' } }, ORG);
    expect(out.where).toEqual({ organizationId: ORG });
  });

  it('overrides a caller-supplied organizationId in create data', () => {
    const out = injectTenant('create', { data: { name: 'X', organizationId: 'other-org' } }, ORG);
    expect(out.data).toEqual({ name: 'X', organizationId: ORG });
  });

  it('does not mutate the caller args object', () => {
    const args = { where: { name: 'X' } };
    injectTenant('findMany', args, ORG);
    expect(args).toEqual({ where: { name: 'X' } });
  });
});

describe('injectTenant — write-data pinning (DEF-M2-1)', () => {
  it('overrides a reassigning organizationId in update data', () => {
    const out = injectTenant('update', { where: { id: 'r' }, data: { organizationId: 'other-org' } }, ORG);
    expect((out.data as Record<string, unknown>).organizationId).toBe(ORG);
    expect(out.where).toEqual({ id: 'r', organizationId: ORG });
  });

  it('overrides a reassigning organizationId in updateMany data', () => {
    const out = injectTenant('updateMany', { where: {}, data: { organizationId: 'other-org', name: 'x' } }, ORG);
    expect(out.data).toEqual({ organizationId: ORG, name: 'x' });
  });

  it('strips the organization RELATION from update data (second vector)', () => {
    const out = injectTenant(
      'update',
      { where: { id: 'r' }, data: { name: 'x', organization: { connect: { id: 'other-org' } } } },
      ORG,
    );
    expect(out.data).toEqual({ name: 'x' }); // relation removed, cannot reassign
  });

  it('does NOT add organizationId to a benign update (no reassignment attempted)', () => {
    const out = injectTenant('update', { where: { id: 'r' }, data: { name: 'x' } }, ORG);
    expect(out.data).toEqual({ name: 'x' }); // untouched
  });

  it('pins organizationId and strips the relation in upsert (create AND update branches)', () => {
    const out = injectTenant(
      'upsert',
      {
        where: { id: 'r' },
        create: { name: 'N', organizationId: 'other-org' },
        update: { organizationId: 'other-org', organization: { connect: { id: 'other-org' } } },
      },
      ORG,
    );
    expect(out.create).toEqual({ name: 'N', organizationId: ORG });
    expect(out.update).toEqual({ organizationId: ORG }); // scalar overridden, relation stripped
  });

  it('strips the organization relation on create and forces organizationId', () => {
    const out = injectTenant('create', { data: { name: 'X', organization: { connect: { id: 'other-org' } } } }, ORG);
    expect(out.data).toEqual({ name: 'X', organizationId: ORG });
  });
});

describe('injectTenant — deny-by-default', () => {
  it('throws TenantScopeError for an unscopable operation', () => {
    expect(() => injectTenant('executeRaw', {}, ORG)).toThrow(TenantScopeError);
    expect(() => injectTenant('weirdOp', {}, ORG)).toThrow(/deny-by-default/);
  });
});
