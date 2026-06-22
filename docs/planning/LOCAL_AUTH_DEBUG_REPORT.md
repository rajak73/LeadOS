# Local Auth Debug Report

**Date:** 2026-06-21
**Symptom:** All authenticated requests return 401 (POST /api/auth/refresh, GET /api/bff/inbox/conversations, etc.)
**Frontend:** Loads successfully at localhost:3000 (pages render, no auth guard redirects)

---

## Verdict

**Root cause: A + D simultaneously.**

> A) User is not logged in — no `leados_session` cookie has ever been set in this browser
> D) Seed data is missing — there is no loginnable user in the database

The auth implementation itself is correct. No code change is required. Two runtime conditions are absent: a seed dev user and a completed login flow.

---

## Full Trace

### 1. Request chain for `GET /api/bff/inbox/conversations`

```
Browser (no leados_session cookie)
  → GET /api/bff/inbox/conversations (Next.js BFF route)
    → resolveAccessToken(request)
        parseCookieHeader(request.headers.get('cookie'))
        cookies['leados_session'] → undefined   ← KEY FAILURE POINT
        return null
    → Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
```

**File:** [apps/web/src/app/api/bff/inbox/conversations/route.ts](apps/web/src/app/api/bff/inbox/conversations/route.ts)
```typescript
const accessToken = await resolveAccessToken(request);
if (!accessToken) return Response.json({ ... }, { status: 401 });
```

The BFF returns 401 immediately at line 2 — it never reaches the API.

---

### 2. Request chain for `POST /api/auth/refresh`

```
Browser (no leados_session cookie)
  → POST /api/auth/refresh (Next.js refresh route)
      cookies = parseCookieHeader(request.headers.get('cookie'))
      session = cookies['leados_session'] → undefined
      if (!session) return Response.json({ success: false }, { status: 401 })  ← returns here
```

**File:** [apps/web/src/app/api/auth/refresh/route.ts](apps/web/src/app/api/auth/refresh/route.ts:21-23)

The 401 is returned at line 21 before any call to the API. The refresh never reaches `localhost:4000`.

---

### 3. Why no `leados_session` cookie exists

The cookie is set only during a successful login:

```
POST /api/auth/login (BFF route)
  → callApi('/api/v1/auth/login', credentials)
    → API: auth.service.login() → sets Set-Cookie: leados_rt=<token>; Path=/api/v1/auth
  → BFF extracts leados_rt value from Set-Cookie header
  → BFF sets Set-Cookie: leados_session=<token>; Path=/; HttpOnly; SameSite=Lax
```

**This login has never completed because:**
1. There is no login page in the web app (see §4 below)
2. There is no loginnable user in the database (see §5 below)

---

### 4. No login page exists

Searching `apps/web/src/app` for all `page.tsx` files reveals only dashboard pages:

```
(dashboard)/page.tsx           ← Dashboard placeholder
(dashboard)/inbox/page.tsx
(dashboard)/leads/page.tsx
(dashboard)/pipeline/page.tsx
(dashboard)/pipeline/deals/[id]/page.tsx
(dashboard)/settings/integrations/instagram/page.tsx
```

The `(auth)` route group exists at `apps/web/src/app/(auth)/` but contains only a `layout.tsx`:
```typescript
// "Auth screens land in Sprint 2."
export default function AuthLayout(...) { ... }
```

**No `/login/page.tsx` or `/register/page.tsx` exists.** The `api-client.ts` interceptor does `window.location.href = '/login'` on auth failure, which hits a 404.

**No Next.js `middleware.ts` exists.** Dashboard pages have no server-side auth guard — they render for unauthenticated users without redirecting to login.

---

### 5. No loginnable seed user in the database

Database state confirmed via Prisma query:

| Metric | Value |
|--------|-------|
| Total users | 233 |
| Users with `emailVerifiedAt != null` | **0** |
| Users with `status = 'ACTIVE'` | 233 |
| Valid refresh tokens (not revoked, not expired) | **0** |

All 233 users are integration test artifacts. They were created by `seedUser()` in test helpers:
```sql
INSERT INTO users (email, "passwordHash", "firstName", "lastName", "updatedAt")
VALUES ($1, 'x', 'Test', 'User', now())
```

Two reasons they cannot log in:
1. `passwordHash = 'x'` — not a valid bcrypt hash; `bcrypt.compare()` returns `false`
2. `emailVerifiedAt = null` — `auth.service.ts:117` explicitly blocks login:
   ```typescript
   if (!user.emailVerifiedAt) {
     throw new AppError(ErrorCode.FORBIDDEN, 'Please verify your email before signing in');
   }
   ```

**File:** [apps/api/src/modules/auth/auth.service.ts](apps/api/src/modules/auth/auth.service.ts:117-119)

The login check fails at line 117 — even before checking the password — for every user in the database.

---

### 6. The seed script is a stub

**File:** [prisma/seed/index.ts](prisma/seed/index.ts)
```typescript
// Seed entrypoint (STUB).
// Real seeds — system roles + default permission sets (doc 11), plan definitions, and
// workflow templates — arrive in Sprint 3 when the tenancy/RBAC models exist.
function main(): void {
  console.log('[seed] No seeds in Sprint 1. Role/plan/template seeds land in Sprint 3.');
}
```

`pnpm db:seed` is a no-op. No dev user was ever inserted.

---

### 7. Auth implementation is correct (nothing to fix here)

The full chain from BFF → API is correctly wired. These items were audited and confirmed working:

| Component | Status | Evidence |
|-----------|--------|---------|
| CSRF guard | ✅ | BFF sends `X-CSRF-Token: 1`; API `csrfGuard` accepts any non-empty value |
| CORS | ✅ | `APP_WEB_ORIGIN=http://localhost:3000` matches `corsMiddleware` allow-list |
| Cookie names | ✅ | API sets `leados_rt`; BFF constant `REFRESH_COOKIE_NAME = 'leados_rt'` matches |
| Cookie path on API | ✅ | `path: '/api/v1/auth'` — BFF calls that path directly, no browser path-scoping applies |
| BFF cookie forwarding | ✅ | `callApi({ refreshToken })` sets `Cookie: leados_rt=<value>` manually (not browser-cookie) |
| JWT signing | ✅ | `JWT_ACCESS_SECRET=''` in root `.env` → stripped by `env.ts` → falls back to dev default `'dev-access-secret-change-me'` |
| `cookieParser` middleware | ✅ | `app.use(cookieParser())` is in `buildApp()` before `/api/v1/auth` routes |
| Refresh token rotation | ✅ | `auth.service.refresh()` correctly reads, marks used, and reissues |

The only thing missing is a user to log in with and a UI to do it through.

---

## Why Pages Load Without 401

The dashboard pages (`/`, `/inbox`, `/pipeline`, etc.) are Next.js App Router RSC pages. They render server-side HTML without any auth check — no `redirect()` call, no `middleware.ts`, no session check on the server. The 401s only appear when client-side JavaScript executes and React Query / axios make data-fetching requests to BFF routes.

---

## Commands Required to Fix

### Step 1 — Create a loginnable dev user in the database

Run this once. Replace `Dev123!` with any password you want to use.

```bash
node --input-type=module <<'EOF'
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({
  datasources: { db: { url: 'postgresql://leados:leados@localhost:5432/leados?schema=public' } }
});

const EMAIL = 'dev@leados.local';
const PASSWORD = 'Dev123!';

const hash = await bcrypt.hash(PASSWORD, 10);

// Create org
const [org] = await db.$queryRawUnsafe(
  `INSERT INTO organizations (name, slug, "updatedAt")
   VALUES ('Dev Org', 'dev-org', now())
   ON CONFLICT (slug) DO UPDATE SET "updatedAt" = now()
   RETURNING id`
);

// Create user (verified, active)
const [user] = await db.$queryRawUnsafe(
  `INSERT INTO users (email, "passwordHash", "firstName", "lastName", status, "emailVerifiedAt", "updatedAt")
   VALUES ($1, $2, 'Dev', 'User', 'ACTIVE', now(), now())
   ON CONFLICT (email) DO UPDATE SET "passwordHash" = $2, "emailVerifiedAt" = now(), "updatedAt" = now()
   RETURNING id`,
  EMAIL, hash
);

// Find or create OWNER role in this org
const [role] = await db.$queryRawUnsafe(
  `INSERT INTO roles (name, "organizationId", "updatedAt")
   VALUES ('OWNER', $1, now())
   ON CONFLICT ("organizationId", name) DO UPDATE SET "updatedAt" = now()
   RETURNING id`,
  org.id
);

// Assign owner to org
await db.$queryRawUnsafe(
  `INSERT INTO organization_members ("userId", "organizationId", "roleId", status, "updatedAt")
   VALUES ($1, $2, $3, 'ACTIVE', now())
   ON CONFLICT ("userId", "organizationId") DO UPDATE SET status = 'ACTIVE', "updatedAt" = now()`,
  user.id, org.id, role.id
);

console.log('Dev user created:');
console.log('  Email:', EMAIL);
console.log('  Password:', PASSWORD);
console.log('  Org:', org.id);
await db.$disconnect();
EOF
```

**Note:** The exact table names (`organization_members`, `roles`) may differ from your Prisma schema. Run `npx prisma studio` or `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';` to confirm table names before running.

### Step 2 — Build a temporary login page or call the login API directly

**Option A (curl — quick check the full chain works):**
```bash
curl -s -c /tmp/cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@leados.local","password":"Dev123!"}' | jq .
```
Then check `/tmp/cookies.txt` for a `leados_session` cookie entry.

**Option B (browser — build the login page):**
Create `apps/web/src/app/(auth)/login/page.tsx` with a form that `POST`s to `/api/auth/login`. This is needed regardless for the full auth flow.

### Step 3 — Verify the fix

After login, test:
```bash
# With the session cookie from Step 2 Option A:
curl -s -b /tmp/cookies.txt http://localhost:3000/api/bff/inbox/conversations | jq .
```
Expected: 200 with conversation data (or empty array).

---

## Table name verification command

Before running the seed script, confirm the actual table names in your schema:

```bash
node --input-type=module <<'EOF'
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: 'postgresql://leados:leados@localhost:5432/leados?schema=public' } } });
const tables = await db.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
console.log(tables.map(t => t.table_name));
await db.$disconnect();
EOF
```

---

## Summary

| Check | Finding |
|-------|---------|
| A) User not logged in | ✅ Confirmed — no `leados_session` cookie in browser |
| B) Cookies missing | ✅ Confirmed — missing because login never completed |
| C) Refresh endpoint broken | ❌ Not the cause — returns 401 correctly when no session cookie present |
| D) Seed data missing | ✅ Confirmed — 233 test users, 0 with `emailVerifiedAt`, seed script is a stub |
| E) Auth middleware mismatch | ❌ Not the cause — all middleware, cookie names, CSRF, CORS are correctly configured |

**Fix path:**
1. Seed one dev user with a known password and `emailVerifiedAt = now()`
2. Log in (via curl or a login page)
3. All subsequent BFF calls will work automatically via the cookie chain
