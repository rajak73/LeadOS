// RBAC-2.2 — pure permission-decision logic + the resolver contract (no DB, no Express).
//
// A member's effective permission set is `${resource}.${action}` keys. A required permission is
// satisfied either directly, or — for the own-scopable actions (read/update/delete) — by holding
// the `_own` variant, in which case the caller is restricted to their OWN records (ownOnly).

/** Actions that have an `_own` (own-records-only) variant. */
const OWN_SCOPABLE = new Set(['read', 'update', 'delete']);

export interface PermissionDecision {
  allowed: boolean;
  /** True when access was granted via a `*_own` permission → restrict to owned records. */
  ownOnly: boolean;
}

export interface ResolvedPermissions {
  roleName: string;
  permissions: ReadonlySet<string>;
}

export interface PermissionResolver {
  /** The member's effective permissions in the org, or null if not an ACTIVE member. */
  resolve(organizationId: string, userId: string): Promise<ResolvedPermissions | null>;
  /** Drop any cached resolution for the member (called on role change / suspend / remove). */
  invalidate(organizationId: string, userId: string): Promise<void>;
}

/** Decide whether `required` is satisfied by `permissions` (and whether it is own-only). */
export function decide(required: string, permissions: ReadonlySet<string>): PermissionDecision {
  if (permissions.has(required)) {
    return { allowed: true, ownOnly: false };
  }
  const dot = required.lastIndexOf('.');
  if (dot > 0) {
    const resource = required.slice(0, dot);
    const action = required.slice(dot + 1);
    if (OWN_SCOPABLE.has(action) && permissions.has(`${resource}.${action}_own`)) {
      return { allowed: true, ownOnly: true };
    }
  }
  return { allowed: false, ownOnly: false };
}
