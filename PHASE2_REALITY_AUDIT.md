# PHASE 2 — CUSTOMER 360 REALITY AUDIT

## 1. Audit Results

After analyzing the Prisma schema, CRM modules, inbox modules, and frontend pages, here are the reality audit findings regarding the Customer 360 features:

### Customer 360 Completion %

Customer Entity ........ 0%
Timeline ............... 60%
Duplicate Detection .... 20%
Engagement Score ....... 50%
Customer Details Page .. 40%

**Overall Customer 360 ... 34%**

---

## 2. Current Architecture

### Database Tables
- **`Lead` & `Contact`:** Kept as separate tables. Leads can be converted to contacts (`convertedToContactId`, `createdFromLeadId`). There is no overarching `Customer` table.
- **`Activity`:** Unified, append-only log table with `relatedLeadId`, `relatedContactId`, etc.
- **`AiScore`:** Specific to `leadId`.
- **`Note` & `File` & `Task` & `Deal`:** Include foreign keys to both `relatedLeadId` and `relatedContactId`.
- **`InstagramConversation` & `WhatsAppConversation`:** Connected to `Lead` and `Contact`.

### API Endpoints
- `/api/v1/leads`: Full CRUD, convert to contact, bulk import.
- `/api/v1/contacts`: Basic CRUD.
- `/api/v1/ai/score`: Lead-only AI scoring.

### Services
- `LeadService`: Handles Lead creation, updating, converting to contact.
- `ActivityService`: Centralized tracking of events.
- `AiService`: Calculates Engagement Score via `ai-scoring.worker.ts`.

### UI Screens
- `/leads/[id]`: A robust `LeadDetailPage` exists with a timeline, notes, files, AI score, and linked deals.
- `/contacts`: Only a list page exists. **No `ContactDetailPage` exists.**

---

## 3. Gap Analysis

1. **Unified Customer Profile (MISSING - 0%)**
   - *Evidence:* No overarching Customer entity or abstraction exists. Leads and Contacts are treated as separate lists.

2. **Timeline (PARTIALLY COMPLETE - 60%)**
   - *Evidence:* `Activity` table handles diverse relations, and `LeadActivityFeed` renders them. *Missing:* A combined UI feed that merges pre-conversion Lead activities with post-conversion Contact activities.

3. **Duplicate Detection (PARTIALLY COMPLETE - 20%)**
   - *Evidence:* The `lead-import.worker.ts` has a duplication check. *Missing:* No duplicate detection on manual API entry, no fuzzy matching, and no UI to merge duplicate records.

4. **Engagement Score (PARTIALLY COMPLETE - 50%)**
   - *Evidence:* Fully implemented for Leads via `AiScore` table and `ai.routes.ts`. *Missing:* Does not exist for Contacts.

5. **Customer Details Page (PARTIALLY COMPLETE - 40%)**
   - *Evidence:* `LeadDetailPage` exists, but there is no `ContactDetailPage` and no unified `Customer360View` that displays the entire lifecycle.

---

## 4. Implementation Plan

**Existing Modules cannot fully satisfy requirements because a Lead inherently transforms into a Contact. To get a true Customer 360 view, we need an abstraction layer (Aggregator) that unites a Lead and its resulting Contact.**

### Files To Reuse
- `prisma/schema.prisma` (Base CRM tables will remain intact, no need to merge Lead/Contact tables since they serve distinct funnel purposes).
- `apps/web/src/components/leads/LeadActivityFeed.tsx` (Can be refactored into a generic `ActivityFeed`).
- `apps/api/src/modules/activities/activity.service.ts` (Already supports polymorphic relationships).

### Files To Extend
- `apps/api/src/modules/leads/lead.service.ts` & `apps/api/src/modules/contacts/contact.service.ts`:
  - *Why:* To add duplicate detection logic and a new `merge()` API.
- `apps/api/src/modules/ai/ai.service.ts` & `ai.routes.ts`:
  - *Why:* To support scoring `Contact` records based on post-conversion activity.

### Files To Create
- `apps/api/src/modules/customers/customer.controller.ts`
- `apps/api/src/modules/customers/customer.service.ts`
- `apps/api/src/modules/customers/customer.routes.ts`
  - *Why create instead of reuse?* We need a unified aggregator. Extending `LeadService` to fetch contact data breaks single responsibility. A Customer Service will aggregate Lead, Contact, Activity, and Deals.
- `apps/web/src/app/(dashboard)/customers/page.tsx`
- `apps/web/src/app/(dashboard)/customers/[id]/page.tsx`
- `apps/web/src/components/customers/Customer360View.tsx`
  - *Why create instead of reuse?* `LeadDetailPage` is deeply coupled to Lead-specific states (convert button, lead status badges). The `Customer360View` needs to handle the seamless continuum of Lead -> Contact.
