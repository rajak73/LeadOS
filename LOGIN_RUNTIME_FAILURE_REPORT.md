# LOGIN RUNTIME FAILURE REPORT

## 1. Executive Summary
The "Invalid email or password" error is occurring because the demo user accounts (`owner@technova.demo`, `superadmin@leados.demo`, etc.) do not exist in the active PostgreSQL database. The API and frontend are running correctly, and the auth routes are properly structured, but the specific script responsible for injecting the rich demo data (`apps/api/scripts/demo-seed.ts`) has not been executed against the current database environment.

## 2. Screenshot Symptom
N/A - Confirmed via terminal and API responses that the UI matches the API's standard `401 Unauthorized` "Invalid email or password" rejection.

## 3. Services Status
| Area | Check | File/Command/Route | Expected | Actual | Result | Evidence |
| ---- | ----- | ------------------ | -------- | ------ | ------ | -------- |
| Web | Web app running | `lsof -i :3000` | Running | Running (Node on 3000) | PASS | Found Node listening on `3000` |
| API | API server running | `lsof -i :4000` | Running | Running | PASS | `curl -s http://localhost:4000/health` returns `{"status":"ok"}` |
| API | API base URL | `cat .env` | `http://localhost:4000/api/v1` | `http://localhost:4000/api/v1` | PASS | `NEXT_PUBLIC_API_URL` is set correctly |
| DB | Database connected | `node scripts/verify-users.ts` | Connected | Connected | PASS | Successfully queried existing users in `leados` DB |

## 4. Frontend Login Request Findings
| Area | Check | File/Command/Route | Expected | Actual | Result | Evidence |
| ---- | ----- | ------------------ | -------- | ------ | ------ | -------- |
| Frontend | API endpoint called | `apps/web/src/app/(auth)/login/page.tsx` | `/api/auth/login` | `/api/auth/login` | PASS | Code explicitly calls Next.js `/api/auth/login` route |
| Frontend | Payload keys | `apps/web/src/app/(auth)/login/page.tsx` | `{ email, password }` | `{ email, password }` | PASS | `JSON.stringify({ email: email.trim(), password })` |
| Frontend | API URL from env | `apps/web/.env` / `.env` | `NEXT_PUBLIC_API_URL` used | Next.js API route handles proxying | PASS | Standard Next.js server-side / BFF pattern |

## 5. Backend Auth Route Findings
| Area | Check | File/Command/Route | Expected | Actual | Result | Evidence |
| ---- | ----- | ------------------ | -------- | ------ | ------ | -------- |
| Backend | Auth route path | `apps/api/src/modules/auth/auth.routes.ts` | `POST /login` | `POST /login` | PASS | `router.post('/login', ...)` |
| Backend | Login controller | `auth.controller.ts` | Validates & calls service | Validates & calls service | PASS | Extracts `LoginInput` and calls `service.login()` |
| Backend | Password comparison | `auth.service.ts` | `verifyPassword` | `verifyPassword` | PASS | Correctly uses bcrypt hash verification |
| Backend | User lookup | `auth.service.ts` | Finds by email | Finds by email | PASS | Uses `this.repo.findUserByEmail(input.email)` |
| Backend | Error handling | `auth.service.ts` | Equalized timing rejection | Equalized timing rejection | PASS | Compares against `DUMMY_HASH` if user missing |

## 6. Database Demo Account Findings
| Area | Check | File/Command/Route | Expected | Actual | Result | Evidence |
| ---- | ----- | ------------------ | -------- | ------ | ------ | -------- |
| DB | User exists | `owner@technova.demo` | yes | no | FAIL | User query returned empty for this email |
| DB | User exists | `superadmin@leados.demo` | yes | no | FAIL | User query returned empty for this email |
| DB | Other Accounts | Any `.demo` account | yes | no | FAIL | DB only contains `owner@leados.com` & `sales@leados.com` |
| DB | Password hash | Existing DB accounts | Hashed string | `"x"` | FAIL | Existing `owner@leados.com` has an invalid mock hash `"x"` |

## 7. Seed Script Findings
| Area | Check | File/Command/Route | Expected | Actual | Result | Evidence |
| ---- | ----- | ------------------ | -------- | ------ | ------ | -------- |
| Seed | Script exists | `apps/api/scripts/demo-seed.ts` | yes | yes | PASS | Script found with 432 lines |
| Seed | Creates exact emails | `demo-seed.ts` | `owner@technova.demo`, etc. | `owner@technova.demo`, etc. | PASS | Array `ORGS` contains all required emails |
| Seed | Hashes password | `demo-seed.ts` | `bcrypt.hash(..., 10)` | `bcrypt.hash(..., 10)` | PASS | Correctly hashes `LeadOS@123` |
| Seed | Actually run? | Database state vs Script | DB matches script | DB does NOT match script | FAIL | The `.demo` users do not exist in the database |

## 8. Direct API Login Test Results
| Area | Check | File/Command/Route | Expected | Actual | Result | Evidence |
| ---- | ----- | ------------------ | -------- | ------ | ------ | -------- |
| API | Direct login | `curl POST /api/v1/auth/login` | 200 OK | 401 UNAUTHORIZED | FAIL | `{"success":false,"error":{"code":"UNAUTHORIZED","message":"Invalid email or password","statusCode":401}}` |
| API | Return JWT/Token | `curl POST /api/v1/auth/login` | yes | no | FAIL | Request blocked at credential verification |

## 9. Root Cause Classification
**DEMO_USER_MISSING / SEED_NOT_RUN**
The auth architecture, backend routing, frontend payload, and API endpoints are all structurally sound and correctly configured. The failure is strictly a data layer issue. The database currently connected (`postgresql://leados:leados@localhost:5432/leados`) does not contain any of the `.demo` accounts required for testing, because `apps/api/scripts/demo-seed.ts` was never executed against it.

When the frontend submits `owner@technova.demo`, `auth.service.ts` correctly cannot find the user, compares against a `DUMMY_HASH` to prevent timing attacks, and throws a safe `401 Unauthorized`.

## 10. Safe Fix Options

### Option A — Run existing demo seed safely
*   **Files affected:** None.
*   **Commands required:** `cd apps/api && node --env-file=../../.env --import tsx scripts/demo-seed.ts` (or `pnpm run db:seed:demo`)
*   **Risk level:** Low.
*   **Data modified:** Will insert the required `.demo` organizations, users, and rich mock data (leads, workflows, pipelines) into the current database.
*   **Rollback plan:** Delete the generated `.demo` accounts from the database via SQL.
*   **Verification plan:** Execute Direct API Login test again to confirm 200 OK and JWT generation.

### Option B — Reset Database and Re-seed
*   **Files affected:** None.
*   **Commands required:** `pnpm dlx prisma migrate reset --force` followed by `pnpm run db:seed:demo`
*   **Risk level:** Medium (destroys current local DB state).
*   **Data modified:** Entire database is wiped and recreated with only demo seed data.
*   **Rollback plan:** None (destructive to local dev data).
*   **Verification plan:** Execute Direct API Login test.

## 11. Recommended Fix
**Option A — Run existing demo seed safely.**
The script `demo-seed.ts` is designed to cleanly upsert the `superadmin@leados.demo` and the `ORGS` array without requiring a full database reset.

## 12. Approval Required
Waiting for explicit Founder approval on **Option A** before executing the seed script.

## 13. Verification Plan After Fix
Once approved and seeded, I will:
1. Verify `owner@technova.demo`, `owner@growthbridge.demo`, `owner@ayurda.demo`, and `superadmin@leados.demo` log in successfully via direct API request.
2. Verify JWT tokens are correctly signed and returned.
3. Verify the loaded JWT payload contains the correct `orgId` and `role`.
4. Optionally run the UI/browser verification to ensure the Dashboard loads and tenant isolation holds true.
