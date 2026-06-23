# Sprint 10 Execution Plan: Advanced Workflows

This document outlines the detailed execution plan for **Sprint 10 (Advanced Workflows)**, introducing extended workflow capabilities including delayed step executions, outbound webhooks with robust SSRF protections, WhatsApp template dispatch actions, and loop execution guardrails.

---

## 1. Overview

Sprint 10 expands the workflow engine to support modern automation requirements, ensuring multi-tenant isolation, execution safety, and robust webhook dispatching.

---

## 2. Milestones

### M1 — Extended Actions & Types
- Extend the `ActionType` enum in both database schema and TypeScript definitions to include:
  - `send_whatsapp_template`
  - `outbound_webhook`
- Register these actions in the shared library schema validation and UI builders.

### M2 — Webhook Actions with SSRF Guard (`workflow.actions.ts`)
- Implement outbound webhook executor with strict SSRF controls:
  - Prevent private, multicast, loopback, and reserved IP ranges (both IPv4 and IPv6).
  - Use custom DNS resolution validation before executing outgoing requests.
  - Enforce a strict 10s execution timeout using `AbortController`.

### M3 — WhatsApp Action Integration
- Implement `send_whatsapp_template` workflow execution step.
- Integrate with the template sync metadata and Cloud API sender queue from Sprint 9.

### M4 — Infinite Loop Execution Guardrails
- Establish the constant `MAX_WORKFLOW_DEPTH = 10`.
- Update the workflow worker to maintain loop depth tracking and abort any run exceeding the depth limit with a clear error payload.

### M5 — Visual Builder & Web UI
- Provide visual configuration builders in the web dashboard for the new actions.
- Render target endpoint URLs, headers, template selector dropdowns, and payload previews.

---

## 3. Files to Create

| File | Purpose |
|------|---------|
| `apps/api/tests/integration/workflow.integration.test.ts` | Integration tests for loop guards, SSRF protection, and action triggers. |
| `packages/shared/src/types/workflow.ts` | Shared types and schemas for the extended action payloads. |

---

## 4. Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Extend `ActionType` enum in DB schema. |
| `apps/api/src/modules/workflow/workflow.actions.ts` | Implement outbound webhook with SSRF guard and WhatsApp sender. |
| `apps/api/src/modules/workflow/workflow.controller.ts` | Expose updated action metadata catalog. |
| `apps/api/src/core/queue/workers/workflow-execution.worker.ts` | Update loop depth execution check to enforce `>= MAX_WORKFLOW_DEPTH`. |
| `apps/web/src/components/workflows/WorkflowFormBuilder.tsx` | Add input controllers for webhook and WhatsApp steps. |
| `packages/shared/src/index.ts` | Export new types and validators. |

---

## 5. Validation Gates
- `npx prisma validate`
- `pnpm typecheck`
- `pnpm check:enum-parity`
- `pnpm --filter @leados/api check:rls`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
