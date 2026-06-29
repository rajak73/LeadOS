# Manual QA Scripts

This folder contains helper scripts generated during Phase 2 (Social Inbox QA).
These scripts safely provision dummy databases and simulate webhooks via local queues.

## Contents
* `qa-setup.ts` / `qa-setup-fb.ts`: Provisions dummy IG/WA/FB accounts in the `technova` org.
* `qa-sim.ts` / `qa-sim-fb.ts` / `qa-sim-fb-3.ts`: Simulates webhook payloads being routed to `webhook.worker.ts`.
* `qa-post-check.ts`: Checks API endpoints for Super Admin RBAC and Tenant Isolation.
* `qa-cleanup.ts`: An idempotent cleanup script that deletes all dummy data created by the above scripts.

## Recommendations
These scripts are safe to keep. In the future, they should be converted into automated E2E tests within `tests/e2e/`.
