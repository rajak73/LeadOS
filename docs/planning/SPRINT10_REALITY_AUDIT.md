# Sprint 10 Reality Audit: Advanced Workflow Engine (V2)

This audit details the status, requirements, database schemas, and missing features for **Sprint 10 (Advanced Workflow Engine)** of the LeadOS application.

---

## 1. Overview & Current Status

* **Status:** 45% Complete
* **Prisma Schema State:** Workflows (`Workflow`), runs (`WorkflowRun`), and logs (`WorkflowLog`) are fully defined and tables are deployed on PostgreSQL.
* **Core Code:** Workflow evaluation service, triggers dispatchers, and basic action runner logic exist. React forms and list screens are implemented.

---

## 2. Feature Breakdown

### Implemented Features
- **Triggers Scaffolding:** Emits and processes triggers `LEAD_CREATED`, `LEAD_STATUS_CHANGED`, `DEAL_CREATED`, `DEAL_STAGE_MOVED`, and `MESSAGE_RECEIVED`.
- **Core Condition Logic:** Evaluator handles nested AND/OR condition trees and comparison operators (`EQUALS`, `NOT_EQUALS`, `CONTAINS`, `GREATER_THAN`, `LESS_THAN`, `IN`, `NOT_IN`).
- **Core Actions:** Supports executing actions `update_lead_status`, `assign_lead`, `add_tag`, `create_task`, `send_notification`, `send_instagram_message`, and `rescore_lead`.
- **Frontend Pages:** Base views for listing workflows and viewing executions exist under `workflows/page.tsx`, `workflows/[id]/page.tsx` and runs history screens.

### Missing Features
- **Wait/Delay Node Execution:** Support for delaying step executions (e.g., "Wait 3 days before sending follow-up email") is missing. This requires delayed job schedulers.
- **Outbound Webhook Actions:** Custom HTTP POST integrations to trigger external SaaS APIs are missing.
- **WhatsApp Action Integration:** Automatic dispatch of WhatsApp templates via workflows is missing.
- **Visual Canvas Interface:** Front-end interactive drag-and-drop builder using React Flow (currently only a vertical form layout exists).
- **Workflow Templates Catalog:** Gallery of pre-built flows to activate inside an organization.
- **Loop/Recursion Guards:** Advanced cycle checking to detect infinite loops (e.g., Lead update triggers Lead update).

### Broken Features
- **Synchronous Run Actions:** All actions execute immediately inside the active worker thread. Lack of delayed queue processing restricts step sequences.

---

## 3. Tech Stack Requirements

### Database Requirements
- Ensure `WorkflowRun` has execution states and can save current paused steps for delayed workflows.

### API Requirements
- Integrate WhatsApp messaging and outbound webhook requests to the workflow runner execution switch.
- Build loop depth detection middleware that prevents execution stacks exceeding limit depths.

### Frontend Requirements
- Create the React Flow canvas workspace page under `workflows/[id]/edit` allowing users to draw nodes and link transitions.
- Configure form modals for advanced delay settings and webhook payload body templates.

### Worker Requirements
- Build delayed task queues (`workflow-delayed-step`) to wake up paused executions.
- Safely resolve outbound webhook actions under GUC tenant context.

---

## 4. Security & RLS Review

* **SSRF Vulnerability:** Outbound webhook actions allow users to request custom URLs. If unfettered, users could scan the server's private network (e.g., AWS Metadata endpoints). The outbound HTTP client must restrict calls to public-only IP boundaries.
* **RLS Coverage:** Workflow runs and logs must run strictly inside tenant transactions client boundaries.

---

## 5. Technical Debt

1. **Cycle Checking:** Triggers lack robust recursive blockades, leaving the system vulnerable to queue exhaustion during infinite loops.
2. **SSRF Guard:** Lack of an egress proxy firewall for outgoing workflow webhooks.
