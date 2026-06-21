# Sprint 6 M6 — Implementation Readiness Review

**Date:** 2026-06-21  
**Reviewer:** Pre-implementation codebase audit  
**Branch:** main (commit 24b2481)  
**Verdict:** See §8

---

## 1. Scope Recap (what M6 must deliver)

| # | Item |
|---|------|
| 1 | Extract `resolveAccessToken` to `bff-auth.ts`; update all 14 BFF route files |
| 2 | Saved-reply CRUD API (`GET`, `POST`, `PATCH`, `DELETE /inbox/saved-replies[/:id]`) |
| 3 | `POST /inbox/conversations/:id/leads` — create a Lead from a conversation |
| 4 | BFF proxy routes for saved-replies and create-lead |
| 5 | `useSavedReplies.ts` + `useCreateLeadFromConversation.ts` hooks |
| 6 | `SavedReplyPicker.tsx` component |
| 7 | `CreateLeadModal.tsx` component |
| 8 | Wire-ups: `ComposeBar.tsx` (picker) + `ConversationHeader.tsx` ("→ Lead" button) |
| 9 | Component tests for new/modified components |
| 10 | Final gates: typecheck, lint, build, test, `check:rls`, `check:enum-parity` |

---

## 2. Assumption Validation Table

| # | Assumption | Status | Evidence |
|---|------------|--------|----------|
| A-1 | `saved_replies` table exists in schema with all needed fields | ✅ CONFIRMED | Schema lines 771–787: `id`, `organizationId`, `title`, `content`, `shortcut?`, `isGlobal`, `createdById`, `createdAt`, `updatedAt`, `deletedAt?` |
| A-2 | `saved_replies` is in `TENANT_TABLES` and `TENANT_MODELS` | ✅ CONFIRMED | `tenant-tables.ts` line 53 (string) + line 89 (model key) |
| A-3 | `instagram_conversations.leadId` FK exists and is nullable | ✅ CONFIRMED | Schema: `leadId String? @db.Uuid` with `@relation(fields: [leadId], references: [id], onDelete: SetNull)` |
| A-4 | `messages.senderId` holds the customer's IG user ID | ✅ CONFIRMED | Schema: `senderId String? @db.VarChar(100)` |
| A-5 | `Lead.instagramUserId` + `Lead.instagramHandle` fields exist | ✅ CONFIRMED | `api.ts` lines 179–180; schema lines 482–483 |
| A-6 | `@@unique([organizationId, instagramUserId])` on Lead | ✅ CONFIRMED | Schema line 523 |
| A-7 | `LeadSource.INSTAGRAM_DM` enum value exists | ✅ CONFIRMED | `api.ts` line 139; enums.ts |
| A-8 | No `SavedReplyPicker`, `CreateLeadModal`, `useSavedReplies`, `useCreateLeadFromConversation` exist yet | ✅ CONFIRMED | Directory listings; no such files found |
| A-9 | No DB migration needed for M6 | ✅ CONFIRMED | All tables already exist; no new schema changes |
| A-10 | `check:rls` still 22 tables after M6 | ✅ CONFIRMED | No new tenant tables added |
| A-11 | `check:enum-parity` still 21 enums after M6 | ✅ CONFIRMED | No new enums added |
| A-12 | `resolveAccessToken` exists inline in exactly 14 BFF route files | ✅ CONFIRMED | `grep -rln "resolveAccessToken" apps/web/src/app/api/bff/` → 14 files |
| A-13 | `apps/web/src/lib/server/bff-auth.ts` does not exist yet | ✅ CONFIRMED | Directory listing: only `bff.ts`, `bff.test.ts`, `constants.ts`, `cookies.ts`, `cookies.test.ts` |
| A-14 | `Modal` component exists and uses Radix Dialog | ✅ CONFIRMED | `components/ui/Modal.tsx`: `@radix-ui/react-dialog`, `open`/`onOpenChange`/`title`/`description`/`children` props |
| A-15 | `useToast` hook is exported from `Toast.tsx` | ✅ CONFIRMED | `Toast.tsx` line 20 |
| A-16 | `UpdateConversationData` in the repo supports `leadId?: string \| null` | ✅ CONFIRMED | `inbox.repository.ts` lines 31–38 |
| A-17 | Customer IG user ID can be parsed from `igConversationId` | ✅ CONFIRMED | Service uses `parts.slice(1).join('_')` (line 71); same logic applies in create-lead handler |
| A-18 | `igAccount.igUsername` is selected in `ConversationWithRelations` | ✅ CONFIRMED | Repository `include` selects `igUsername` and `profilePictureUrl` from `igAccount` |
| A-19 | `Lead.firstName` is a required (non-nullable) field | ✅ CONFIRMED | Schema: `firstName String @db.VarChar(100)` — not optional |

---

## 3. Schema Validation Table

| Field | Model | Type | Nullable | M6 Usage | Issue? |
|-------|-------|------|----------|----------|--------|
| `id` | SavedReply | UUID | No | PK for CRUD | ✅ None |
| `organizationId` | SavedReply | UUID | No | Injected by tenant ext | ✅ None |
| `title` | SavedReply | VarChar(200) | No | Required on POST | ✅ None |
| `content` | SavedReply | Text | No | Required on POST | ✅ None |
| `shortcut` | SavedReply | VarChar(20) | Yes | Optional on POST | ✅ None |
| `isGlobal` | SavedReply | Boolean | No | Default `true`; visible to all | ✅ None |
| `createdById` | SavedReply | UUID (FK→users) | No | Set from `ctx.userId` | ✅ None |
| `deletedAt` | SavedReply | DateTime | Yes | Soft-delete on DELETE | ✅ None |
| `leadId` | InstagramConversation | UUID | Yes | Set by create-lead handler | ✅ None |
| `instagramUserId` | Lead | VarChar(50) | Yes | Set on new lead creation | ⚠️ See R-1 |
| `instagramHandle` | Lead | VarChar(100) | Yes | May be null at creation time | ⚠️ See R-2 |
| `firstName` | Lead | VarChar(100) | **No** | **REQUIRED** — no natural value available | 🔴 See R-3 |
| `source` | Lead | LeadSource enum | No | Set to `INSTAGRAM_DM` | ✅ None |

---

## 4. Route Validation Table

### 4.1 Backend API Routes (to be added to `inbox.routes.ts`)

| Method | Path | Permission | Service Method | Status |
|--------|------|------------|---------------|--------|
| GET | `/inbox/saved-replies` | `inbox.reply` | `listSavedReplies` | 🟡 Not yet implemented |
| POST | `/inbox/saved-replies` | `inbox.assign` | `createSavedReply` | 🟡 Not yet implemented |
| PATCH | `/inbox/saved-replies/:id` | `inbox.assign` | `updateSavedReply` | 🟡 Not yet implemented |
| DELETE | `/inbox/saved-replies/:id` | `inbox.assign` | `deleteSavedReply` | 🟡 Not yet implemented |
| POST | `/inbox/conversations/:id/leads` | `inbox.assign` | `createLeadFromConversation` | 🟡 Not yet implemented |

### 4.2 BFF Routes (to be added under `apps/web/src/app/api/bff/`)

| Method | BFF Path | Proxies to | Status |
|--------|----------|------------|--------|
| GET | `/api/bff/inbox/saved-replies` | `/api/v1/inbox/saved-replies` | 🟡 Not yet implemented |
| POST | `/api/bff/inbox/saved-replies` | `/api/v1/inbox/saved-replies` | 🟡 Not yet implemented |
| PATCH | `/api/bff/inbox/saved-replies/:id` | `/api/v1/inbox/saved-replies/:id` | 🟡 Not yet implemented |
| DELETE | `/api/bff/inbox/saved-replies/:id` | `/api/v1/inbox/saved-replies/:id` | 🟡 Not yet implemented |
| POST | `/api/bff/inbox/conversations/:id/leads` | `/api/v1/inbox/conversations/:id/leads` | 🟡 Not yet implemented |

### 4.3 Existing routes (unchanged)

All 5 existing inbox routes confirmed present and unchanged:
- `GET /conversations` → `inbox.read` ✅  
- `GET /conversations/:id` → `inbox.read` ✅  
- `GET /conversations/:id/messages` → `inbox.read` ✅  
- `PATCH /conversations/:id` → `inbox.assign` ✅  
- `POST /conversations/:id/messages` → `inbox.reply` ✅  

---

## 5. Permission Validation Table

| Operation | Proposed Guard | OWNER | ADMIN | MANAGER | SALES_EXEC | Issue? |
|-----------|---------------|-------|-------|---------|------------|--------|
| GET saved-replies | `inbox.reply` | ✅ | ✅ | ✅ | ✅ (via `inbox.reply_own`) | ✅ Correct |
| POST saved-replies | `inbox.assign` | ✅ | ✅ | ✅ | ❌ | ✅ Intentional — global templates are manager-owned |
| PATCH saved-replies/:id | `inbox.assign` | ✅ | ✅ | ✅ | ❌ | ✅ Intentional |
| DELETE saved-replies/:id | `inbox.assign` | ✅ | ✅ | ✅ | ❌ | ✅ Intentional |
| POST conversations/:id/leads | `inbox.assign` | ✅ | ✅ | ✅ | ❌ | ⚠️ See R-4 |

**Key observation on `inbox.reply` for saved-reply reads:** The RBAC `decide()` function treats `inbox.reply_own` as a grant for `inbox.reply` with `ownOnly=true`. This means SALES_EXECUTIVE holders (who have `inbox.reply_own`) CAN list saved-replies. Since saved-replies are org-global (isGlobal=true by default) and there is no per-user filter needed, `ownOnly` has no effect on the list endpoint — all saved replies are visible to anyone with any form of `inbox.reply`. This is the correct behavior.

**No new permissions needed.** Adding `inbox.manage_saved_replies` or similar would require updating `PERMISSION_CATALOG`, `MANAGER_PERMISSIONS`, role seeding SQL, and `check:enum-parity`. Using existing permissions avoids this cost.

---

## 6. UI/UX Compliance Validation

| Requirement (from `SPRINT_6_UI_UX_PLAN.md`) | Status | Notes |
|--------------------------------------------|--------|-------|
| No hardcoded hex colors | 🟡 Must enforce during implementation | All new components must use design tokens only |
| No `transition-all` | 🟡 Must enforce during implementation | Use specific transitions only |
| No new component library | ✅ Plan uses existing `Modal`, `Button`, `Select`, `Badge` | No Radix additions beyond what's already imported |
| Reuse existing `Modal` primitive | ✅ `Modal.tsx` confirmed: `open`, `onOpenChange`, `title`, `description`, `children` props | CreateLeadModal wraps this |
| `SavedReplyPicker` spec: `absolute bottom-full`, `bg-bg-elevated border border-border rounded-xl shadow-xl` | 🟡 Must enforce during implementation | Token names confirmed present in existing components |
| `CreateLeadModal` pre-fill `instagramHandle` as `readOnly opacity-60 cursor-not-allowed` | ⚠️ See R-2, R-3 | Handle may be IG user ID at creation time |
| "→ Lead" ghost button in `ConversationHeader` | 🟡 New prop + conditional render required | Current `ConversationHeader` has no such button |
| Inbox visually matches Pipeline and Deal Detail pages | 🟡 No existing structural divergence; must maintain during implementation | |
| `useSavedReplies` hook invalidates on mutate | 🟡 Standard RQ mutation pattern; implement with `queryClient.invalidateQueries` | |

---

## 7. Required Corrections

### R-1 — Unique constraint race on `createLeadFromConversation`

**Issue:** `Lead` has `@@unique([organizationId, instagramUserId])`. If two agents simultaneously create leads for the same customer, one insert will throw Prisma `P2002`.

**Required fix:** `createLeadFromConversation` must:
1. First query `findFirst({ where: { instagramUserId: customerIgUserId } })`
2. If found, return 409 (`CONFLICT`) with a clear message: "A lead for this Instagram account already exists"
3. If not found, create the lead

**Alternative:** `upsert` by `(organizationId, instagramUserId)` — but an upsert that returns an existing lead would silently ignore the conflict, which is less correct UX.

**Recommended:** Pre-check + throw `CONFLICT`. Add no new error code — the existing `ErrorCode.CONFLICT` is sufficient.

### R-2 — `instagramHandle` not available at conversation creation time

**Issue:** `instagramHandle` (the human-readable `@username`) requires the `instagram-enrich` worker job to complete. The worker is fire-and-forget and may not have run by the time an agent clicks "→ Lead".

**What IS available:**
- `conversation.igConversationId` → parse customer IG user ID via `parts.slice(1).join('_')`
- `conversation.lead?.instagramHandle` if enrichment already ran (non-null)

**Required fix in `CreateLeadModal`:**
- Pre-fill field with `conversation.lead?.instagramHandle ?? customerIgUserId` (fallback to IG user ID)
- The label should say "Instagram User ID / Handle" to reflect the possible fallback state
- Keep `readOnly` + `opacity-60 cursor-not-allowed` per UX plan — do not let agent edit this field

**No schema change needed.** The `instagramHandle` field will be populated later by the enrichment worker.

### R-3 — `firstName` is required on Lead, no natural value available at create time

**Issue:** `Lead.firstName String` (NOT NULL). When creating a lead from a conversation, we have only the IG user ID (numeric). There is no `firstName` until enrichment runs.

**Required behavior:** The `CreateLeadModal` must include a `firstName` input field (required, not pre-filled) so the agent can enter the customer's name. This is the correct UX — the agent who is talking to the customer knows their name.

**`lastName`** is nullable, so it is optional.

**This is already implied by the UX plan** (CreateLeadModal spec in §2.13 shows form fields), but the M6 implementation must not skip this field.

### R-4 — SALES_EXECUTIVE cannot create leads from conversations

**Issue:** `POST /conversations/:id/leads` uses `inbox.assign`, which SALES_EXECUTIVE does not have. This means sales reps assigned to conversations cannot convert them to leads — only MANAGERs can.

**Decision required:** Is this intentional?

- **If intentional:** Document it. No code change. SALES_EXECUTIVE must ask a manager.
- **If not intentional:** Add `inbox.create_lead` permission to catalog and SALES_EXECUTIVE permissions. This adds scope (seeding migration, new permission, catalog update).

**Recommendation:** Treat as intentional for M6. Lead creation from DM is a qualifying action that a manager reviews first. This matches the existing pattern (`inbox.assign` is already manager-only, and this is a similar qualifying action). Document in M6 signoff. Can be relaxed in a future sprint.

### R-5 — `InboxService.updateConversation` patch type excludes `leadId`

**Issue:** The service method `updateConversation(id, { assignedToId?, status? })` does not accept `leadId`. The repository's `UpdateConversationData` does include `leadId?: string | null`, but the service surface does not expose it.

**Required fix:** `createLeadFromConversation` must NOT try to reuse `updateConversation`. It must be a standalone service method that:
1. Validates the conversation exists (calls `convRepo.findByIdOrThrow`)
2. Checks for existing lead via `instagramUserId` (see R-1)
3. Creates the lead within the same `withTenant` transaction
4. Calls `convRepo.update(conversationId, { leadId: newLead.id })` directly

**Do not modify `updateConversation`'s signature** — that method is guarded by `inbox.assign` and is for assignment/status changes. Adding `leadId` to it would expose an unintended surface.

### R-6 — Missing `LEAD_ALREADY_LINKED` (or equivalent) error code

**Issue:** When a conversation already has a `leadId`, `createLeadFromConversation` should reject with a clear error. There is no dedicated error code for "conversation already has a lead".

**Required fix:** Use `ErrorCode.CONFLICT` with message `"This conversation is already linked to a lead"`. No new error code is needed — `CONFLICT` maps to HTTP 409 and the message is sufficient.

---

## 8. Risk Register

| Risk | Severity | Probability | Mitigation |
|------|----------|-------------|------------|
| R-3: Missing firstName causes TypeScript error at build time | HIGH | Certain if skipped | Add firstName input to CreateLeadModal |
| R-1: P2002 on concurrent lead creation | MEDIUM | Low in practice | Pre-check in service |
| R-5: Calling wrong service method for leadId update | MEDIUM | Medium | Use separate `createLeadFromConversation` method |
| R-4: SALES_EXECUTIVE cannot create leads | LOW | Not a bug if intentional | Document + accept |
| `bff-auth.ts` refactor breaks an existing BFF test | HIGH | Low (BFF tests are self-contained) | Run full BFF test suite immediately after extraction |
| SavedReply soft-delete filter omitted in list query | MEDIUM | Medium | `deletedAt: null` filter required in list query |
| `ComposeBar` prop change breaks `InboxPage.test.tsx` | LOW | Low (prop is additive, not breaking) | SavedReplyPicker trigger can be new optional prop |

---

## 9. Implementation Order (verified against codebase state)

This order minimizes risk and maintains CI green after each step:

1. **BFF extraction** — `bff-auth.ts` + update 14 files + `bff-auth.test.ts` → run `pnpm test` (web)
2. **Backend: SavedReply** — `PrismaSavedReplyRepository`, `SavedReplyService` methods, controller handlers, routes in `inbox.routes.ts`
3. **Backend: `createLeadFromConversation`** — new service method + controller + route
4. **Backend tests** — `inbox-saved-replies.integration.test.ts` + `inbox-create-lead.integration.test.ts`
5. **BFF: saved-replies proxy** — `saved-replies/route.ts` + `saved-replies/[id]/route.ts`
6. **BFF: create-lead proxy** — `conversations/[id]/leads/route.ts`
7. **Hooks** — `useSavedReplies.ts` + `useCreateLeadFromConversation.ts`
8. **Components** — `SavedReplyPicker.tsx` + `CreateLeadModal.tsx`
9. **Wire-ups** — `ComposeBar.tsx` (picker) + `ConversationHeader.tsx` ("→ Lead" button + `CreateLeadModal`)
10. **Component tests** — `ComposeBar.test.tsx`, `ConversationHeader` (new test or additions), `SavedReplyPicker.test.tsx`, `CreateLeadModal.test.tsx`
11. **Final gates** — `pnpm typecheck && pnpm lint && pnpm build && pnpm test && pnpm check:rls && pnpm check:enum-parity`

---

## 10. Acceptance Criteria (from plan, verified against codebase)

| Criterion | Verifiable? | Notes |
|-----------|-------------|-------|
| `bff-auth.ts` contains `resolveAccessToken`; all 14 BFF files import from it | ✅ Yes | `grep -rn "from.*bff-auth"` must return 14 results |
| `GET /inbox/saved-replies` returns `{ items, nextCursor }` | ✅ Yes | Matches envelope pattern |
| `POST /inbox/conversations/:id/leads` returns 201 + new Lead | ✅ Yes | |
| `SavedReplyPicker` opens above ComposeBar, keyboard navigable, closes on Escape | ✅ Yes | UI spec §2.10 |
| `CreateLeadModal` pre-fills IG user ID / handle, requires firstName | ✅ Yes | Post R-3 correction |
| `ConversationHeader` shows "→ Lead" ghost button when `conversation.leadId === null` | ✅ Yes | |
| All existing tests pass unchanged | ✅ Yes | Especially inbox + BFF tests |
| `check:rls` still passes (22 tables) | ✅ Yes | No new tables |
| `check:enum-parity` still passes (21 enums) | ✅ Yes | No new enums |

---

## 8. Final Verdict

### ✅ READY FOR IMPLEMENTATION — with 3 required corrections before coding

The M6 plan is structurally sound. All database tables, relations, types, permissions, and UI primitives are confirmed present. The corrections below are **mandatory** and must be incorporated into the implementation — they are not blockers to starting but are blockers to completing M6 correctly:

| Correction | Where | Effort |
|------------|-------|--------|
| **R-3** — Add `firstName` input field to `CreateLeadModal` (required, not pre-filled) | Frontend component | Trivial |
| **R-5** — `createLeadFromConversation` must be its own service method (not via `updateConversation`) that calls `convRepo.update` directly for the `leadId` link | Backend service | Small |
| **R-1** — Pre-check for existing lead by `instagramUserId` before insert; return `CONFLICT` if found | Backend service | Trivial |

Corrections R-2 and R-4 are **documentation-only** (no code change, behavior is acceptable):
- R-2: Pre-fill shows IG user ID when handle is unavailable — acceptable; enrichment will populate it later
- R-4: SALES_EXECUTIVE cannot create leads from conversations — intentional; document in signoff

No new permissions, no migration, no new error codes, no schema changes required.
