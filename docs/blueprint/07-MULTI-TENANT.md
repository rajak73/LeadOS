# 07 — Multi-Tenant Architecture

> **⚠ UPDATED per `docs/planning/P0_FIXES.md` (P0-1, P0-2, P0-3).** The original §7.3 tenancy mechanism was incorrect (RLS GUC set on a different connection than the query; app-layer scoping omitted writes/aggregates; per-query transactions blocked atomic multi-write operations). The corrected **Tenancy Model** below is authoritative. Consolidated architecture: `docs/planning/FINAL_ARCHITECTURE.md`.

---

## 7.1 Tenancy Model Decision

**Model: Shared Database, Shared Schema with Row-Level Isolation**

| Approach | Pros | Cons | Decision |
|---|---|---|---|
| Separate database per tenant | Maximum isolation | Unmanageable at 10K orgs | ❌ Rejected |
| Separate schema per tenant | Good isolation, manageable | Complex migrations at scale | ❌ Rejected |
| **Shared schema + RLS** | **Simple ops, good isolation at DB level** | **Requires discipline** | **✅ Selected** |

**Defense-in-Depth Layers:**
1. **Application Layer**: All queries require `organization_id` filter (Prisma Extension)
2. **ORM Layer**: Prisma Extension auto-injects tenant context
3. **Database Layer**: PostgreSQL Row Level Security (RLS) as final safety net

---

## 7.2 Tenant Identification

### Tenant Resolution Flow
```
[1] User authenticates → receives JWT
[2] JWT payload contains: { userId, organizationId, role }
[3] Every request → authMiddleware extracts JWT
[4] tenantMiddleware:
    a. Reads organizationId from JWT
    b. Validates org exists and is active (cached in Redis, 5 min TTL)
    c. Sets req.context = { userId, organizationId, role, permissions }
[5] Prisma Extension reads req.context.organizationId
[6] Injects organizationId into every query automatically
```

### Multi-Organization Users
- A user email can belong to multiple organizations (via OrganizationMember)
- JWT is issued per `(user, organization)` session
- On login: if user belongs to multiple orgs → org selection screen
- org selection → new JWT issued for selected org
- User can switch organizations without re-entering password

---

## 7.3 PostgreSQL Row Level Security (RLS)

### Setup Strategy
RLS is the **last line of defense** — if application code has a bug and forgets to apply `organization_id`, the database itself will block the query.

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- ... all tenant tables

-- Create application role (used by Prisma connection)
CREATE ROLE leados_app;

-- RLS Policy: app role can only see rows matching current_setting.
-- NOTE the missing-safe form `current_setting(..., true)`: when the GUC is unset
-- it returns NULL → the predicate fails → DENY BY DEFAULT (never raises).
CREATE POLICY tenant_isolation ON leads
  FOR ALL
  TO leados_app
  USING (organization_id = current_setting('app.current_organization_id', true)::UUID);

-- The application role (leados_app) is RLS-enforced and has NO bypass.
-- A SEPARATE platform-admin role is granted BYPASSRLS for Super Admin paths only:
CREATE ROLE leados_platform_admin BYPASSRLS;

-- Tenant context is set ONCE at the start of each unit-of-work transaction,
-- using set_config(..., true) (the transaction-scoped / SET LOCAL form), so the
-- GUC and every query in that unit of work share the SAME pinned connection:
-- SELECT set_config('app.current_organization_id', '<org-uuid>', true);
```

### Setting Tenant Context in Prisma (CORRECTED MECHANISM)

> The original code-sample here was removed: it set the RLS GUC via `prisma.$transaction` on the **base** client while the real query ran on the **extended** client — a different pooled connection — so the GUC was usually unset and RLS silently became a no-op. It also injected `organizationId` only on create/read (leaving update/delete/upsert/aggregate/groupBy unscoped), and wrapped every query in its own transaction (making atomic multi-write operations impossible). The corrected mechanism is described below in prose (no code).

**The Tenancy Model — three rules, one mechanism:**

1. **One transaction per unit of work.** A "unit of work" is a service operation (often a single request handler call). It runs inside a single Prisma interactive transaction. Long-running external calls (Meta/OpenAI/Stripe) stay **outside** the transaction (on queues) so transactions remain short.

2. **Set tenant context once, on the transaction's connection.** The transaction's **first statement** runs `SELECT set_config('app.current_organization_id', <orgId>, true)`. The `true` argument makes it transaction-scoped (the function form of `SET LOCAL`), so the GUC is pinned to the same connection that every subsequent statement in the unit of work uses. RLS therefore sees the correct org on **every** statement.

3. **Defense-in-depth app-layer scoping on EVERY operation.** A Prisma client extension, bound to the transaction client, injects `organizationId` for tenant-scoped models on **all** operations — not just create/read:
   - Writes with a `where` (`update`, `updateMany`, `delete`, `deleteMany`, `upsert`, and the `*OrThrow` variants): inject into `where` (and into create/update payloads for `upsert`).
   - Writes without a `where` (`createMany`): inject into each `data` row.
   - Reads/aggregates (`findMany`, `findFirst`, `findUnique`, `count`, `aggregate`, `groupBy`): inject into `where`.
   - The model list is **deny-by-default**: any operation on a tenant-scoped model that cannot be safely scoped is rejected, never passed through unscoped.

**Pooling requirement:** PgBouncer / Neon pooler must run in **transaction pooling mode**, which is compatible with per-transaction `set_config(..., true)`. This is validated by the Sprint-3 performance benchmark *before* any domain module is built on top.

**Why this is correct:** the GUC and all queries share one connection (RLS enforces), app-layer injection covers all operations (defense-in-depth), and the unit-of-work transaction lets a service compose multiple writes atomically. RLS is the backstop — a missed injection is caught at the database, not leaked.

---

## 7.4 Tenant Middleware

```typescript
// core/middleware/tenantMiddleware.ts

export const tenantMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { userId, organizationId } = req.auth; // set by authMiddleware

  // Validate org membership (cached)
  const cacheKey = `org_member:${userId}:${organizationId}`;
  let membership = await redis.get(cacheKey);

  if (!membership) {
    membership = await prisma.organizationMember.findFirst({
      where: { userId, organizationId, status: 'ACTIVE' },
      include: { role: { include: { permissions: true } } },
    });

    if (!membership) {
      throw new AppError('FORBIDDEN', 'Not a member of this organization', 403);
    }

    await redis.setex(cacheKey, 300, JSON.stringify(membership)); // 5 min cache
  }

  // Build request context
  req.context = {
    userId,
    organizationId,
    role: membership.role.name,
    permissions: membership.role.permissions.map(p => p.key),
    // Scoped Prisma client with tenant extension pre-applied
    db: prisma.$extends(tenantExtension(organizationId)),
  };

  next();
};
```

---

## 7.5 Cross-Tenant Security

### What is Prevented
| Attack Vector | Prevention |
|---|---|
| Accessing another org's leads via URL manipulation | Application middleware rejects (org_id mismatch) + RLS blocks |
| Accessing data by guessing UUIDs | UUIDs v4 (random, not sequential), RLS enforces org scope |
| Privilege escalation within org | RBAC permission matrix checked on every operation |
| Webhook spoofing to inject data into wrong org | Instagram webhooks validated by app_id in payload → org lookup |
| Token theft from one org used in another | JWT binds to specific organizationId |

### Super Admin Access
- Super Admin is a platform-level role (not org-level)
- Super Admin has a separate JWT claim: `{ role: "SUPER_ADMIN" }`
- Super Admin bypasses tenant middleware using a **separate platform-admin database role granted `BYPASSRLS`** (role `leados_platform_admin`), strictly distinct from the RLS-enforced application role (`leados_app`). The application role NEVER has `BYPASSRLS`. (Using a "raw Prisma client" on the application role would be blocked by RLS, since its GUC is unset.)
- All Super Admin actions logged in a separate `platform_audit_logs` table
- Super Admin access is time-limited (session expires in 2 hours, no refresh)
- All Super Admin logins require 2FA

---

## 7.6 Tenant Onboarding Flow

```
[1] User submits registration form
[2] API creates User record (email, password hash)
[3] API creates Organization record (name, slug, plan: TRIAL)
[4] API creates OrganizationMember (userId, organizationId, role: OWNER)
[5] API creates default Subscription (trial, 14 days)
[6] API creates default Pipeline ("Sales Pipeline") with 5 default stages
[7] API creates default Role set (Owner, Admin, Manager, Sales Executive)
[8] Sends verification email
[9] Returns JWT (userId, organizationId, role: OWNER)
[10] Frontend redirects to onboarding checklist
```

> **Atomicity (P0-3):** steps [2]–[7] above execute as a **single unit-of-work transaction** with tenant context set once at the start. Either the full org bootstrap (user → org → member → subscription → default pipeline + stages → seeded roles) succeeds, or it all rolls back. No partial org state (e.g., an org with no subscription) is possible.

### Tenant Slug Strategy
- Slug: URL-safe, lowercase, 3–30 chars, alphanumeric + hyphens
- Used for: future custom domain routing (`acmecorp.leados.app`)
- Uniqueness enforced at database level (unique index)
- Cannot be changed after creation (would break bookmarked URLs)

---

## 7.7 Plan Limits Enforcement

### Limit Enforcement Strategy
Every plan-limited operation must:
1. Check current usage against plan limit
2. Reject with clear error if limit exceeded
3. Suggest upgrade path in error response

```typescript
// Example: Enforce seat limit
const checkSeatLimit = async (organizationId: string) => {
  const org = await getOrgWithSubscription(organizationId);
  const currentSeats = await countActiveMembers(organizationId);
  const limit = PLAN_LIMITS[org.subscription.plan].seats;
  
  if (currentSeats >= limit) {
    throw new AppError(
      'PLAN_LIMIT_EXCEEDED',
      `Your ${org.subscription.plan} plan allows ${limit} team members. Upgrade to add more.`,
      402,
      { currentUsage: currentSeats, limit, upgradeUrl: '/billing' }
    );
  }
};
```

### Plan Limits Table
| Resource | Starter | Growth | Scale |
|---|---|---|---|
| Team members (seats) | 3 | 10 | Unlimited |
| Leads (total) | 500 | 5,000 | Unlimited |
| Contacts (total) | 500 | 10,000 | Unlimited |
| Pipelines | 1 | 5 | Unlimited |
| Active Workflows | 5 | 25 | Unlimited |
| Custom Fields | 10 | 30 | 50 per object |
| AI scoring calls/month | 500 | 5,000 | Unlimited |
| Instagram accounts | 1 | 3 | 10 |
| WhatsApp accounts | 0 | 1 | 5 |
| Data export | ❌ | ✅ | ✅ |
| API access | ❌ | ❌ | ✅ |
