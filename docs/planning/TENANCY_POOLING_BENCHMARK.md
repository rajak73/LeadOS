# TENANCY_POOLING_BENCHMARK.md

> **TEN-3.1.4 — Tenancy mechanism validation + micro-benchmark**
> Sprint 3 M1 · Date: 2026-06-19 · Source: `FINAL_ARCHITECTURE.md` §2.1
> Artifact backing: `apps/api/scripts/tenancy-bench.ts` (`pnpm --filter @leados/api bench:tenancy`)

This is the M1 **gate** that the tenancy mechanism is correct and cheap *before* any tenant-aware data layer (M3) is built.

---

## 1. What was validated

The Sprint-3 unit-of-work pattern (§2.1): **one interactive transaction** whose **first statement** is
`set_config('app.current_organization_id', <orgId>, true)` (the `SET LOCAL`, transaction-scoped form),
followed by RLS-enforced queries — executed as the **NOBYPASSRLS** role `leados_app`.

| Property | Result |
|---|---|
| GUC pinned to the same connection as the query (P0-1) | ✅ proven — the scoped `role.count()` returns exactly the org's rows every iteration (`n===2` asserted in the bench; 0 rows when the GUC is unset, per the RLS suite) |
| RLS enforces for the app role (not bypassed) | ✅ `leados_app` is `rolsuper=f`, `rolbypassrls=f`; unset GUC → 0 rows |
| Mechanism overhead | ✅ negligible (below) |

---

## 2. Micro-benchmark results

500 iterations, role `leados_app`, **direct** local Postgres connection (Postgres 16):

| Workload | mean | p50 | p95 | p99 |
|---|---|---|---|---|
| **Tenant unit-of-work** (tx + `SET LOCAL` GUC + RLS `count`) | 0.366 ms | 0.348 ms | **0.445 ms** | 0.679 ms |
| Baseline (`SELECT 1`, no tx/GUC) | 0.092 ms | 0.090 ms | 0.111 ms | 0.125 ms |

**Reading:** the GUC + RLS + interactive-transaction envelope adds ~**0.26 ms p50 / ~0.33 ms p95** over a bare round-trip. The absolute tenant unit-of-work p95 (**0.445 ms**) is ~**900× under** the 400 ms P95 API NFR (`FINAL_ARCHITECTURE.md` §… performance gate). RLS + per-transaction GUC is not a performance concern at this layer.

> Numbers are machine-relative (local dev). They establish the **shape** (sub-millisecond, dominated by the round-trip, tiny RLS delta), not an SLA. The SLA is asserted by the §… P95 load test later.

---

## 3. Transaction-mode pooler safety (Neon / PgBouncer)

The architecture mandates a **transaction-mode** pooler (§2.1). The mechanism is pooler-safe **by construction**:

- `set_config(..., true)` / `SET LOCAL` is **transaction-scoped** — it lives and dies inside the one transaction, on the one backend connection that transaction holds. Transaction-mode pooling assigns a server connection for the duration of a transaction, so the GUC and every subsequent statement in that unit of work share the same pinned connection. ✅ compatible.
- We never rely on **session-level** state (`SET` without `LOCAL`, session GUCs, prepared-statement session caches) across statements — which is exactly what transaction-mode pooling would break. ✅ none used.
- Risk **R1** (GUC set on a different connection than the query → silent cross-tenant leak) is structurally prevented: the GUC is the *first statement inside the same interactive transaction* as the queries.

### Status / remaining external validation
- ✅ **Mechanism + correctness + overhead**: validated locally against direct Postgres (this doc).
- ⏳ **Production pooler number**: the p95 against the real Neon transaction-mode pooler must be captured in the staging environment before the first domain module ships (Sprint 4). This requires the deployed pooler and is **not** blocking for M2/M3 development, because correctness (not latency) is what gates the mechanism, and correctness is proven here + by the RLS suite.

**Gate verdict for M1:** ✅ PASS — mechanism correct, pooler-safe by construction, overhead negligible. Cleared to proceed to M2 (tenant context + extension). The production-pooler latency capture is tracked as a Sprint-4 pre-domain task.

---

*Validation artifact — re-runnable via `pnpm --filter @leados/api bench:tenancy` (set `DATABASE_APP_URL`).*
