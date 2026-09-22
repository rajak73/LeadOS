# LeadOS API

Base path: `/api`. All request/response bodies are JSON unless noted. Request bodies are
validated with the zod schemas in `packages/shared/src/schemas.ts`; response shapes are the
types in `packages/shared/src/types.ts`.

## Conventions

**Envelope.** Every JSON response is wrapped:

```jsonc
{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 25, "total": 80, "totalPages": 4 } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Check the highlighted fields.", "details": { "email": ["Enter a valid email address"] } } }
```

`meta` is present on paginated lists only. `error.message` is always safe to show to users.
Status codes follow `ERROR_STATUS` in `packages/shared/src/errors.ts` (validation = 422).

**Auth.** `POST /auth/login` returns an access token (JWT, 15 min) in the body and sets an
HttpOnly refresh cookie `leados_rt` (path `/api/auth`, SameSite=Lax, Secure in production,
30 days). Send `Authorization: Bearer <accessToken>` on every other request. When a request
returns 401, call `POST /auth/refresh` once (the client must share one in-flight refresh
promise), then retry. Refresh rotates the cookie; a token reused within a 30-second grace
window after rotation returns the same new session instead of revoking the family (handles
two tabs refreshing at once). Reuse outside the window revokes the family.

State-changing requests on `/auth/*` (refresh, logout) require header `X-Requested-With: fetch`
(simple CSRF guard, since they rely on the cookie).

**Roles.** `ADMIN` can do everything. `MEMBER` can read and write CRM records (leads,
contacts, deals, tasks, notes) and read pipelines and workflows, but cannot: manage users,
change settings, create/edit/delete pipelines or workflows, or bulk-delete. Endpoints marked
**(admin)** return 403 for members.

**Soft delete.** Leads, contacts, deals, tasks and workflows are soft-deleted (`deletedAt`)
and never returned afterwards.

**Pagination.** `?page=1&limit=25` (max 100). Array filters accept repeated params or
comma-separated values: `?status=NEW,CONTACTED`. `assignedToId` also accepts `me` and
`unassigned`.

## Auth & account

| Method | Path            | Body / query           | Returns                                                                                                                        |
| ------ | --------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/auth/status`  | —                      | `AuthStatus` (public)                                                                                                          |
| POST   | `/auth/setup`   | `setupSchema`          | `AuthSession` + cookie (201). Only when no users exist, else 409. Creates the admin user, settings row and a default pipeline. |
| POST   | `/auth/login`   | `loginSchema`          | `AuthSession` + cookie. 5 failed attempts lock the account for 15 min (429 `RATE_LIMITED` while locked). Rate-limited per IP.  |
| POST   | `/auth/refresh` | — (cookie)             | `AuthSession` + rotated cookie                                                                                                 |
| POST   | `/auth/logout`  | — (cookie)             | `null`, clears cookie, revokes family                                                                                          |
| GET    | `/me`           | —                      | `User`                                                                                                                         |
| PATCH  | `/me`           | `updateProfileSchema`  | `User` (409 if email taken)                                                                                                    |
| POST   | `/me/password`  | `changePasswordSchema` | `null`; revokes all other sessions                                                                                             |

## Team & settings

| Method | Path                              | Body / query              | Returns                                                                                            |
| ------ | --------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| GET    | `/users`                          | —                         | `User[]` (all users, incl. disabled; any role — needed for assignee pickers)                       |
| POST   | `/users` **(admin)**              | `createUserSchema`        | `User` (409 if email exists)                                                                       |
| PATCH  | `/users/:id` **(admin)**          | `updateUserSchema`        | `User`. Cannot demote/disable yourself or the last active admin (409). Disabling revokes sessions. |
| POST   | `/users/:id/password` **(admin)** | `resetUserPasswordSchema` | `null`                                                                                             |
| GET    | `/settings`                       | —                         | `AppSettings`                                                                                      |
| PATCH  | `/settings` **(admin)**           | `updateSettingsSchema`    | `AppSettings`                                                                                      |

## Leads

| Method | Path                 | Body / query                                 | Returns                                                                                                                                                                                                                                                                                                                                                          |
| ------ | -------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/leads`             | `leadListQuerySchema`                        | `Lead[]` + meta. `search` matches first/last name, email, phone, company.                                                                                                                                                                                                                                                                                        |
| POST   | `/leads`             | `createLeadSchema`                           | `Lead` (201). 409 `CONFLICT` if a non-deleted lead with the same email exists (`details.existingId: [id]`). `LOST` is not allowed on create.                                                                                                                                                                                                                     |
| GET    | `/leads/:id`         | —                                            | `LeadDetail`                                                                                                                                                                                                                                                                                                                                                     |
| PATCH  | `/leads/:id`         | `updateLeadSchema`                           | `Lead`. Status → LOST requires `lostReason`; leaving LOST clears it. A converted (WON) lead's status can't change (409 `INVALID_TRANSITION`).                                                                                                                                                                                                                    |
| DELETE | `/leads/:id`         | —                                            | `null`                                                                                                                                                                                                                                                                                                                                                           |
| POST   | `/leads/:id/convert` | `convertLeadSchema`                          | `{ lead: Lead, contact: Contact, deal: Deal \| null }`. Sets status WON, creates a contact (or links an existing contact with the same email) and optionally a deal in the first open stage. 409 if already converted.                                                                                                                                           |
| POST   | `/leads/:id/score`   | —                                            | `AiScore` — scores now (sync). 503 `AI_UNAVAILABLE` only if OpenAI fails _and_ the rules fallback is disabled (never, by default).                                                                                                                                                                                                                               |
| GET    | `/leads/:id/scores`  | —                                            | `AiScore[]` newest first (max 20)                                                                                                                                                                                                                                                                                                                                |
| POST   | `/leads/bulk`        | `bulkLeadsSchema`                            | `{ affected: number }`. `delete` is admin-only.                                                                                                                                                                                                                                                                                                                  |
| POST   | `/leads/import`      | multipart `file` (CSV, ≤ 2 MB, ≤ 5,000 rows) | `ImportResult`. Header row required; recognised columns (case-insensitive): first name / firstName / name, last name, email, phone, company, source, status, tags (`;`-separated). Unknown columns ignored. Source/status accept labels ("Website") or values; default source `IMPORT`. Imported leads trigger `LEAD_CREATED` workflows but not AI auto-scoring. |
| GET    | `/leads/export`      | same filters as `GET /leads` (no pagination) | `text/csv` download, max 10,000 rows                                                                                                                                                                                                                                                                                                                             |
| GET    | `/leads/tags`        | —                                            | `string[]` — distinct tags in use, for filter autocomplete                                                                                                                                                                                                                                                                                                       |

## Contacts

| Method | Path            | Body / query             | Returns            |
| ------ | --------------- | ------------------------ | ------------------ |
| GET    | `/contacts`     | `contactListQuerySchema` | `Contact[]` + meta |
| POST   | `/contacts`     | `createContactSchema`    | `Contact` (201)    |
| GET    | `/contacts/:id` | —                        | `ContactDetail`    |
| PATCH  | `/contacts/:id` | `updateContactSchema`    | `Contact`          |
| DELETE | `/contacts/:id` | —                        | `null`             |

## Pipelines & deals

| Method | Path                         | Body / query           | Returns                                                                                                             |
| ------ | ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET    | `/pipelines`                 | —                      | `Pipeline[]` (default first)                                                                                        |
| POST   | `/pipelines` **(admin)**     | `createPipelineSchema` | `Pipeline`                                                                                                          |
| GET    | `/pipelines/:id/board`       | —                      | `PipelineBoard`                                                                                                     |
| PATCH  | `/pipelines/:id` **(admin)** | `updatePipelineSchema` | `Pipeline`. Removing a stage that holds deals → 409 with a message naming the stage.                                |
| DELETE | `/pipelines/:id` **(admin)** | —                      | `null`. 409 if it has deals or is the only/default pipeline.                                                        |
| GET    | `/deals`                     | `dealListQuerySchema`  | `Deal[]` + meta                                                                                                     |
| POST   | `/deals`                     | `createDealSchema`     | `Deal` (201). Stage must belong to pipeline (422). Creating directly in a won/lost stage sets status.               |
| GET    | `/deals/:id`                 | —                      | `Deal`                                                                                                              |
| PATCH  | `/deals/:id`                 | `updateDealSchema`     | `Deal`                                                                                                              |
| POST   | `/deals/:id/move`            | `moveDealSchema`       | `Deal`. Into isWon stage → WON + closedAt; into isLost → LOST (+lostReason); out of won/lost → OPEN, closedAt null. |
| DELETE | `/deals/:id`                 | —                      | `null`                                                                                                              |

## Tasks & notes & timeline

| Method | Path          | Body / query                                         | Returns                                                                                                                                                              |
| ------ | ------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/tasks`      | `taskListQuerySchema`                                | `Task[]` + meta. `due`: overdue = dueDate < now & not done; today = current calendar day, week = today + next 6 days, both in settings timezone; none = no due date. |
| POST   | `/tasks`      | `createTaskSchema`                                   | `Task` (201)                                                                                                                                                         |
| PATCH  | `/tasks/:id`  | `updateTaskSchema`                                   | `Task`. status → COMPLETED sets completedAt; leaving COMPLETED clears it.                                                                                            |
| DELETE | `/tasks/:id`  | —                                                    | `null`                                                                                                                                                               |
| GET    | `/notes`      | `?leadId` \| `?contactId` \| `?dealId` (exactly one) | `Note[]` newest first                                                                                                                                                |
| POST   | `/notes`      | `createNoteSchema`                                   | `Note` (201)                                                                                                                                                         |
| PATCH  | `/notes/:id`  | `updateNoteSchema`                                   | `Note` — author or admin only                                                                                                                                        |
| DELETE | `/notes/:id`  | —                                                    | `null` — author or admin only (hard delete)                                                                                                                          |
| GET    | `/activities` | `timelineQuerySchema`                                | `Activity[]` newest first (cursor via `before`)                                                                                                                      |

## Notifications

In-app only. The web app polls `GET /notifications/unread-count` every 30 s.

| Method | Path                          | Body / query                  | Returns                 |
| ------ | ----------------------------- | ----------------------------- | ----------------------- |
| GET    | `/notifications`              | `notificationListQuerySchema` | `Notification[]` + meta |
| GET    | `/notifications/unread-count` | —                             | `{ count: number }`     |
| POST   | `/notifications/:id/read`     | —                             | `null`                  |
| POST   | `/notifications/read-all`     | —                             | `null`                  |

Notifications are created when: a lead/deal/task is assigned to someone other than the actor;
a task becomes due (checked every minute, once per task, for tasks due within the next 15 min
or overdue and not yet reminded); a workflow `send_notification` action runs; a lead's AI
score crosses 70 for the first time (to the assignee).

## Workflows

| Method | Path                         | Body / query           | Returns                                                                                                                                                                                     |
| ------ | ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/workflows`                 | —                      | `Workflow[]`                                                                                                                                                                                |
| POST   | `/workflows` **(admin)**     | `createWorkflowSchema` | `Workflow`                                                                                                                                                                                  |
| GET    | `/workflows/:id`             | —                      | `Workflow`                                                                                                                                                                                  |
| PATCH  | `/workflows/:id` **(admin)** | `updateWorkflowSchema` | `Workflow`                                                                                                                                                                                  |
| DELETE | `/workflows/:id` **(admin)** | —                      | `null`                                                                                                                                                                                      |
| GET    | `/workflows/:id/runs`        | `paginationSchema`     | `WorkflowRun[]` + meta                                                                                                                                                                      |
| GET    | `/workflows/meta`            | —                      | `{ fields: Record<WorkflowTrigger, Array<{ key: string; label: string; type: 'string' \| 'number' \| 'enum' \| 'tags'; options?: string[] }>> }` — fields usable in conditions per trigger. |

**Engine.** Domain services emit events on an in-process event bus after their DB write
commits. The workflow engine subscribes, loads active workflows whose `triggerType` matches,
checks `trigger.config` (keys: `fromStatus`/`toStatus` for LEAD_STATUS_CHANGED; `minScore`/`maxScore`
for LEAD_SCORED; `pipelineId`, `stageId`, `fromStageId` for deal triggers), evaluates conditions against the entity,
and runs actions sequentially, writing a `WorkflowRun` with per-action logs. Runs are queued
in-process (concurrency 4) so the triggering request isn't slowed. Actions performed by a
workflow emit events with `depth + 1`; runs at depth ≥ 3 are recorded as SKIPPED (loop guard).
`outbound_webhook` POSTs `{ event, entity, workflowId, runId }` with a 10 s timeout, no
redirects, and refuses private/loopback/link-local/CGNAT addresses after DNS resolution
(connect to the resolved IP).

## Search, analytics, health

| Method | Path                   | Body / query           | Returns                                                        |
| ------ | ---------------------- | ---------------------- | -------------------------------------------------------------- |
| GET    | `/search`              | `searchQuerySchema`    | `SearchResults`                                                |
| GET    | `/analytics/dashboard` | `analyticsQuerySchema` | `DashboardSummary`                                             |
| GET    | `/health`              | —                      | `{ status: 'ok', db: 'ok' }` (public, no envelope requirement) |

## AI lead scoring

Model: OpenAI `gpt-4o-mini` (`OPENAI_MODEL`, default `gpt-4o-mini`) using JSON-schema
structured output. The prompt includes the lead's fields, tags, open deals and the last 20
activities. When `OPENAI_API_KEY` is not set, or the call fails/times out (15 s), the
deterministic rules scorer (`modelVersion: "rules-v1"`) is used instead so scoring always
works. When `settings.aiScoringAuto` is on, leads are rescored (debounced 10 s per lead)
after create, status change and new notes.
