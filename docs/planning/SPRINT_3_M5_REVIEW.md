# SPRINT_3_M5_REVIEW.md

> **Sprint 3 — Milestone 5 (E5: Audit Foundations) — implementation review**
> Author: Engineering, LeadOS · Date: 2026-06-19
> Scope implemented: **M5 only** (AUD-1 … AUD-3) per `SPRINT_3_EXECUTION_PLAN.md`. No E6 (Isolation Gate) work. No architecture decisions modified. **Runtime connection NOT switched to `leados_app`** (D2). **D-M3-2 respected** (audit writes are org-scoped via `withTenant`; the platform scaffold is a deliberate raw cross-org path).

---

## 1. What M5 Delivered

A tenant-scoped, RLS-protected audit trail with PII-masked before/after snapshots, hooked into the RBAC role-admin actions, plus a platform-audit scaffold for the future super-admin path.

| Task | Delivered |
|---|---|
| **AUD-1** `audit_logs` model + infra | Tenant model `AuditLog` + migration `0006_audit` (table, FK, indexes, **RLS enabled+forced+missing-safe policy**), added to the tenant-table registry (now 5 tenant tables; `check:rls` green). Partition-ready structure (`(organizationId, createdAt)` index). |
| **AUD-2** Audit write path | `PrismaAuditRecorder.record()` writes an org-scoped row via `withTenant` (organizationId injected — org-free create), stamping actor/ip from the tenant context, with **PII-masked** before/after snapshots. Hooked into RBAC: `assignRole` → `member.role_changed`, `suspendMember` → `member.suspended` (with before/after). |
| **AUD-3** `platform_audit_logs` scaffold | Non-tenant model `PlatformAuditLog` (no RLS) + `PrismaPlatformAuditWriter` writing via the raw admin client (platform actions are cross-org, not RLS-scoped). The durable surface the super-admin runtime (§2.3) will use. |

---

## 2. Files Changed

**New**
```
prisma/migrations/0006_audit/migration.sql + rollback.sql   audit_logs (+RLS) + platform_audit_logs
apps/api/src/core/audit/pii-masking.ts (+ .test.ts)         recursive email/phone masking (6 tests)
apps/api/src/core/audit/audit-recorder.ts (+ .test.ts)      AuditRecorder + buildAuditRow (3 tests)
apps/api/src/core/audit/platform-audit.ts                   PlatformAuditWriter scaffold
apps/api/tests/integration/audit.integration.test.ts        end-to-end writes + masking (4 tests)
```
**Modified**
```
prisma/schema.prisma                          + AuditLog, PlatformAuditLog models
apps/api/src/core/tenancy/tenant-tables.ts    + audit_logs / AuditLog / platform_audit_logs (registry)
apps/api/src/core/tenancy/tenant-tables.test.ts  registry now 5 tenant tables
apps/api/src/core/tenancy/context.ts          + ipAddress (for audit snapshots)
apps/api/src/core/middleware/tenant.middleware.ts  set ctx.ipAddress = req.ip
apps/api/src/modules/rbac/rbac.repository.ts  + getMemberSnapshot (before-image)
apps/api/src/modules/rbac/rbac.service.ts     audit hook on assign/suspend
apps/api/src/modules/rbac/rbac.service.test.ts  audit-recording assertions
apps/api/src/modules/rbac/index.ts            wire PrismaAuditRecorder
```

---

## 3. Tests Added (13 new; +audit assertions on the 6 RBAC-service tests)

| Suite | Tests | Proves |
|---|---|---|
| `pii-masking.test.ts` (unit) | 6 | email/phone masking; recursion into nested objects/arrays; primitives unchanged |
| `audit-recorder.test.ts` (unit) | 3 | actor/ip stamped from context; **PII masked** in before/after; before/after omitted when absent; no organizationId in the row |
| `rbac.service.test.ts` (unit, updated) | 6 | role-change/suspend **record audit**; failures do NOT audit |
| `audit.integration.test.ts` (DB-gated) | 4 | role change → org-scoped `member.role_changed` row (before/after, actor); suspend → `member.suspended`; **PII masked end-to-end** in stored snapshot; **platform_audit_logs** scaffold write |

**Verification of "records written correctly":** the integration test reads the persisted rows and asserts `organizationId` (extension-injected), `actorUserId`, and the exact before/after JSON.
**Verification of PII masking:** unit (pure) + integration (a stored snapshot with `email`/`phone` comes back as `s***@corp.com` / `***2222`, non-PII preserved).

---

## 4. Validation Results (all green)

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 4/4 |
| `pnpm lint` | ✅ 4/4 |
| `pnpm build` | ✅ 3/3 |
| `pnpm test` (api, CI-mirror) | ✅ **219 passed / 1 skipped** (+13 vs 206) |
| `pnpm test:coverage` (api) | ✅ **83.25 / 87.32 / 82.79 / 83.25** — all ≥ 60 floor (up from 82.59) |
| `pnpm --filter @leados/api check:rls` | ✅ "5 tenant tables enabled + forced + policied; coverage matches registry" |
| `0006_audit` migration + rollback | ✅ applied; rollback round-trip (apply → rollback → re-apply) verified |
| **Existing flows** (auth / tenancy / RBAC) | ✅ still pass (register 201; RBAC enforcement + invalidation; tenant e2e) |
| **D2 compliance** | ✅ runtime still admin; no connection switch |
| **D-M3-2 respected** | ✅ audit writes via `withTenant` (org from context); platform writes are an explicit non-tenant scaffold |

---

## 5. Acceptance Criteria Status

| Item | Status |
|---|---|
| **AUD-1** `audit_logs` model + infrastructure (RLS, registry, partition-ready) | ✅ Met |
| **AUD-2** write path with before/after snapshots + PII masking | ✅ Met (hooked to RBAC actions) |
| **AUD-3** `platform_audit_logs` scaffold | ✅ Met |
| Audit records written correctly (verified) | ✅ integration-verified |
| PII masking verified | ✅ unit + integration |

**Deferred by design (not M5):** the cross-tenant isolation suite as a required CI gate (E6/M6) and the `leados_app` runtime connection switch (D2).

---

## 6. Risks Discovered

| # | Finding | Disposition |
|---|---|---|
| **D-M5-1** | **Audit write is best-effort (non-blocking).** A write failure is logged, not propagated, so a broken audit silently loses a record (observable via the error log). | Acceptable for foundations; fail-closed durability is a hardening option (e.g., for security-critical actions). |
| **D-M5-2** | **Audit is a SEPARATE transaction from the audited action.** `assignRole`/`suspendMember` commit the change in one `withTenant`, then write audit in another. If the action commits and the audit write fails, the action is unaudited. | Acceptable for foundations; **atomic audit** (write the audit row inside the same transaction as the action) is the hardening — requires threading the tx client into the recorder. Flag for a later pass. |
| **D-M5-3** | **Partition-readiness is structural, not native.** `audit_logs` has the `(organizationId, createdAt)` index but is not a native `PARTITION BY RANGE (createdAt)` table (that needs the partition key in the PK). | Native partitioning + rotation tooling is a future op (SC-1/DB-2), as scoped. |
| **D-M5-4** | **`platform_audit_logs` grants.** The `ALTER DEFAULT PRIVILEGES` from migration 0002 grants `leados_app` DML on the new table too (no code path uses it). | Scaffold; restrict grants to `leados_platform_admin` when the super-admin runtime lands. |
| **D-M3-2** (carried) | Identity reads under `leados_app` + RLS still need a strategy before the connection switch. **Unchanged by M5.** | The connection-switch milestone (highest-priority carry-forward). |

---

## 7. Readiness for M6 (E6: Isolation Gate) — ✅ READY

| Entry criterion | Status |
|---|---|
| RLS on every tenant table (incl. the new `audit_logs`) | ✅ 5/5; `check:rls` green |
| App-layer tenant extension + RLS backstop proven (M1/M2) | ✅ |
| RBAC enforcement + audit available to drive isolation scenarios | ✅ (M4/M5) |
| `isolation.yml` scaffold present to flip to a required gate | ✅ (exists since S1; activates in M6) |
| Two-DB-role testing (`leados_app`) wired in CI | ✅ since M1 (`DATABASE_APP_URL`) |

**M6 (E6: Isolation Gate) is clear to begin.** Recommended start: ISO-1 (app-layer cross-tenant suite, now including `audit_logs`) → ISO-2 (RLS-layer suite as `leados_app`) → ISO-3 (RBAC enforcement matrix) → ISO-4 (activate `isolation.yml` as a required merge gate, DEF-3 guard ensuring it executes).

> Carry-forward to the connection-switch milestone (not M6 unless bundled): resolve **D-M3-2** before switching the runtime to `leados_app`.

---

*Implementation review — M5 (E5) only. No E6 code, no architecture changes, runtime connection unchanged, D-M3-2 respected, no acceptance criteria skipped.*
