# PHASE10A_ORG_ADMIN_VISIBILITY_AUDIT_PLAN

## 1. Approved Scope
Prepare a detailed audit plan for Organization Data Assignment and Admin Visibility. We will assess Super Admin vs. Organization Admin data isolation, verify cross-tenant boundaries, and prepare for safe demo data generation. **No code has been modified in this phase.**

## 2. Files Reviewed
- `prisma/schema.prisma` (Database models and relationships)
- `apps/api/src/core/tenancy/` (Prisma client extensions, context, and scoping)
- `apps/api/src/core/auth/` (Auth token payloads)
- `apps/web/src/app/(dashboard)/admin/` (Frontend admin pages)
- `apps/api/scripts/demo-seed.ts` (Existing seed script)

## 3. Current Data Model Findings
- **Organization Assignment:** All core business records (`Lead`, `Contact`, `Deal`, `Task`, `Message`, `Pipeline`, `Activity`, `Note`, `File`) have an explicit `organizationId` column.
- **User Global Scope:** The `User` model is globally scoped (no `organizationId`). Users are linked to organizations via the `OrganizationMember` table, which also dictates their role via `Role`.
- **Super Admin Flag:** Super Admins are identified via the `isSuperAdmin` boolean on the `User` model.

## 4. Tenant Isolation Findings
- **Tenancy Middleware:** The `tenant-extension.ts` Prisma extension acts as an application-level RLS (Row Level Security). It intercepts Prisma queries and automatically injects `organizationId` derived from the current request context (`context.ts`).
- **Data Leakage Risk:** Because `organizationId` is enforced by the auth context, URL tampering (e.g., trying to fetch a lead from another org) is natively blocked.

## 5. Super Admin Visibility Findings
- **Identification:** `isSuperAdmin` boolean.
- **Capabilities:** Super Admins require the ability to list all organizations and view counts/summaries.
- **Audit Need:** We must audit the `organizations` backend endpoints to ensure Super Admins can fetch aggregated data (users, leads, deals count per org) safely, which requires intentionally bypassing the `tenant-extension` for specific admin queries.

## 6. Organization Admin Visibility Findings
- **Identification:** Based on `OrganizationMember.roleId` mapping to an Admin role.
- **Capabilities:** Can only access data within their active `organizationId`.
- **Audit Need:** Verify that role-based access control (RBAC) correctly prevents Org Admins from accessing Super Admin routes or other tenants.

## 7. Frontend Admin Pages Findings
- **Existing Pages:** Found routes in `apps/web/src/app/(dashboard)/admin/` including `/dashboard`, `/organizations`, and `/users`.
- **Audit Need:** Verify that the `/organizations` page adequately displays safe summaries and counts for Super Admins. Determine if UI adjustments are required to visualize multi-tenant stats clearly.

## 8. Demo Data / Seed Findings
- **Existing Script:** `apps/api/scripts/demo-seed.ts` exists.
- **Audit Need:** The script must be refactored to explicitly generate data for specific organizations requested by the founder:
  - TechNova Realty
  - GrowthBridge Agency
  - CureCare Clinic
- **Production Guardrail:** The script must definitively abort if `NODE_ENV === 'production'` unless a highly specific override flag is provided, and even then, never without founder approval.

## 9. Gaps Found
- The exact API queries driving the Super Admin organization list may not yet fetch rich counts (e.g., total leads, active users).
- Need to ensure `demo-seed.ts` is fully idempotent and aligns with the new schema (e.g., pipeline stages, social inbox models).

## 10. Recommended Implementation Plan
- **Phase 10B:** Backend Audit & Implementation. Ensure admin APIs return safe summaries, and enforce `isSuperAdmin` guards on admin routes.
- **Phase 10C:** Frontend Audit & Implementation. Update admin dashboard tables to display organization stats. Ensure Org Admins don't see the admin menu.
- **Phase 10D:** Demo Data Script Update. Refactor `demo-seed.ts` to idempotently generate TechNova, GrowthBridge, and CureCare demo data safely.

## 11. Risks
- Careless bypassing of the `tenant-extension` in admin routes could theoretically leak data if applied to the wrong Prisma query. Admin endpoints must be strictly isolated.

## 12. Validation Plan
- Verify API responses as an Org Admin vs. Super Admin (403 Forbidden checks).
- Manually review the `/admin/organizations` UI.
- Dry-run the updated `demo-seed.ts` locally.

## 13. Production Safety Rules
- Do not print secrets.
- Do not commit env files.
- Do not run production migration.
- Do not run seed/reset/db push.
- Do not modify Prisma schema without approval.
- Do not weaken tenant isolation.
- Do not call real Meta APIs.
- Do not send real social messages.

## 14. Open Questions for Founder
- Should Super Admins have the ability to "impersonate" an organization (view the CRM exactly as they see it), or is viewing summary tables sufficient for now?

## 15. PASS/FAIL Readiness Verdict
**PASS** — The audit plan is complete. Ready to proceed to Phase 10B implementation upon founder approval.
