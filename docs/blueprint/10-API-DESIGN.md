# 10 — API Design

> **⚠ UPDATED per `docs/planning/P0_FIXES.md` (P0-4, P0-5).** Canonical inbound webhook paths are confirmed as `/api/webhooks/*` (unversioned, unauthenticated). The `/auth/refresh` endpoint relies on a same-site HttpOnly cookie plus a CSRF custom-header/Origin check (doc 19 §19.1). Consolidated architecture: `docs/planning/FINAL_ARCHITECTURE.md`.

---

## 10.1 API Design Principles

- **RESTful resource naming** with consistent noun-based URLs
- **Versioning via URL path**: all routes prefixed `/api/v1/`
- **Consistent response envelope** (success/error shapes)
- **Cursor-based or offset-based pagination** depending on context
- **ISO 8601 dates** in all requests and responses
- **HTTPS only** — HTTP redirects to HTTPS
- **JSON content-type** required for all POST/PATCH/PUT bodies

---

## 10.2 Response Envelope

### Success Response
```json
{
  "success": true,
  "data": { /* single object or array */ },
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 347,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "statusCode": 422,
    "details": {
      "fields": {
        "email": "Invalid email format",
        "phone": "Phone number must be 10 digits"
      }
    }
  }
}
```

### Error Code Registry
| Code | HTTP Status | Description |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Request body/query failed Zod validation |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `FORBIDDEN` | 403 | Valid auth but insufficient permissions |
| `NOT_FOUND` | 404 | Resource does not exist in this org |
| `CONFLICT` | 409 | Duplicate resource (email/slug already exists) |
| `PLAN_LIMIT_EXCEEDED` | 402 | Plan quota reached |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Downstream dependency failure |

---

## 10.3 Pagination Strategy

### Offset Pagination (default for lists)
```
GET /api/v1/leads?page=2&limit=25&sortBy=createdAt&sortOrder=desc
```
- `page`: 1-indexed
- `limit`: 10–100, default 25
- `sortBy`: any indexed column
- `sortOrder`: asc | desc
- Response includes `meta.total`, `meta.page`, `meta.hasNextPage`

### Cursor Pagination (real-time feeds, inbox)
```
GET /api/v1/inbox/conversations?cursor=<base64-encoded-cursor>&limit=50
```
- Used for: message history, notification feed, activity timeline
- Cursor encodes: `{ id, timestamp }` of last seen item
- More efficient for large datasets; no `OFFSET` cost

---

## 10.4 Filtering Strategy

```
GET /api/v1/leads?status=NEW,CONTACTED&source=INSTAGRAM_DM&assignedToId=<uuid>&minScore=70&search=john
```

### Standard Filter Parameters
| Parameter | Type | Applies To |
|---|---|---|
| `status` | enum (comma-separated) | leads, deals, tasks |
| `source` | enum (comma-separated) | leads |
| `assignedToId` | UUID | leads, deals, conversations |
| `pipelineId` | UUID | deals |
| `stageId` | UUID | deals |
| `minScore` | integer | leads, deals |
| `maxScore` | integer | leads, deals |
| `tags` | string (comma-separated) | leads, contacts, deals |
| `createdAfter` | ISO 8601 | all |
| `createdBefore` | ISO 8601 | all |
| `search` | string | full-text search |

---

## 10.5 Search Strategy

Full-text search uses PostgreSQL's `to_tsvector` index:
```
GET /api/v1/leads?search=john+smith
GET /api/v1/contacts?search=acme+corp
```
- Searches across: name, email, phone, tags (leads/contacts)
- Minimum 2 characters required
- Results ranked by relevance (ts_rank)
- Trigram similarity for fuzzy matching (pg_trgm extension)

---

## 10.6 Versioning Strategy

- Current version: **v1** (`/api/v1/`)
- New version introduced when: breaking changes to request/response shape
- Old version maintained for **12 months** after deprecation notice
- Version sunset communicated via: response headers (`Deprecation`, `Sunset`) and email to API users
- Internal services always on latest version

---

## 10.7 Complete REST Endpoint Reference

### Authentication
```
POST   /api/v1/auth/register           Create account + org
POST   /api/v1/auth/login              Login, receive access + refresh tokens
POST   /api/v1/auth/refresh            Refresh access token
POST   /api/v1/auth/logout             Revoke refresh token
POST   /api/v1/auth/forgot-password    Send password reset email
POST   /api/v1/auth/reset-password     Reset password with token
GET    /api/v1/auth/me                 Get current user profile
PATCH  /api/v1/auth/me                 Update name, avatar
PATCH  /api/v1/auth/me/password        Change password (requires old password)
GET    /api/v1/auth/sessions           List active sessions
DELETE /api/v1/auth/sessions/:id       Revoke specific session
POST   /api/v1/auth/verify-email       Verify email with token
POST   /api/v1/auth/resend-verification Resend verification email
```

### Organization
```
GET    /api/v1/org                     Get org details
PATCH  /api/v1/org                     Update org settings
DELETE /api/v1/org                     Delete org (soft delete)
GET    /api/v1/org/usage               Get current usage vs plan limits
```

### Team Members
```
GET    /api/v1/team                    List all members
POST   /api/v1/team/invite             Invite new member by email
GET    /api/v1/team/:memberId          Get member profile
PATCH  /api/v1/team/:memberId/role     Change member role
PATCH  /api/v1/team/:memberId/suspend  Suspend member
DELETE /api/v1/team/:memberId          Remove member
```

### Roles & Permissions
```
GET    /api/v1/roles                   List all org roles
GET    /api/v1/roles/:roleId           Get role + permissions
PATCH  /api/v1/roles/:roleId/permissions  Update role permissions
```

### Leads
```
GET    /api/v1/leads                   List leads (filter, sort, paginate)
POST   /api/v1/leads                   Create lead
GET    /api/v1/leads/:leadId           Get lead details
PATCH  /api/v1/leads/:leadId           Update lead fields
DELETE /api/v1/leads/:leadId           Soft delete lead
POST   /api/v1/leads/:leadId/assign    Assign to user
PATCH  /api/v1/leads/:leadId/status    Change status
POST   /api/v1/leads/:leadId/convert   Convert to contact
GET    /api/v1/leads/:leadId/activities Get activity timeline
GET    /api/v1/leads/:leadId/tasks     Get linked tasks
GET    /api/v1/leads/:leadId/notes     Get notes
POST   /api/v1/leads/:leadId/notes     Create note
GET    /api/v1/leads/:leadId/files     Get files
POST   /api/v1/leads/import            Bulk CSV import
GET    /api/v1/leads/import/:jobId     Check import status
POST   /api/v1/leads/export            Export to CSV (async)
```

### Contacts
```
GET    /api/v1/contacts                List contacts
POST   /api/v1/contacts                Create contact
GET    /api/v1/contacts/:contactId     Get contact details
PATCH  /api/v1/contacts/:contactId     Update contact
DELETE /api/v1/contacts/:contactId     Soft delete
GET    /api/v1/contacts/:contactId/activities
GET    /api/v1/contacts/:contactId/deals
GET    /api/v1/contacts/:contactId/tasks
GET    /api/v1/contacts/:contactId/notes
POST   /api/v1/contacts/:contactId/notes
GET    /api/v1/contacts/:contactId/files
```

### Pipelines
```
GET    /api/v1/pipelines               List pipelines
POST   /api/v1/pipelines               Create pipeline
GET    /api/v1/pipelines/:pipelineId   Get pipeline with stages + deal counts
PATCH  /api/v1/pipelines/:pipelineId   Update pipeline settings
DELETE /api/v1/pipelines/:pipelineId   Delete pipeline

GET    /api/v1/pipelines/:pipelineId/stages       List stages
POST   /api/v1/pipelines/:pipelineId/stages       Create stage
PATCH  /api/v1/pipelines/:pipelineId/stages/reorder  Reorder stages
PATCH  /api/v1/pipelines/:pipelineId/stages/:stageId  Update stage
DELETE /api/v1/pipelines/:pipelineId/stages/:stageId  Delete stage
```

### Deals
```
GET    /api/v1/deals                   List all deals (cross-pipeline)
POST   /api/v1/deals                   Create deal
GET    /api/v1/deals/:dealId           Get deal details
PATCH  /api/v1/deals/:dealId           Update deal
DELETE /api/v1/deals/:dealId           Soft delete deal
PATCH  /api/v1/deals/:dealId/stage     Move to new stage
PATCH  /api/v1/deals/:dealId/won       Mark as won
PATCH  /api/v1/deals/:dealId/lost      Mark as lost (requires reason)
GET    /api/v1/deals/:dealId/activities
GET    /api/v1/deals/:dealId/tasks
GET    /api/v1/deals/:dealId/notes
POST   /api/v1/deals/:dealId/notes
GET    /api/v1/deals/:dealId/files
```

### Tasks
```
GET    /api/v1/tasks                   List tasks (filter by assignee, status, due)
POST   /api/v1/tasks                   Create task
GET    /api/v1/tasks/:taskId           Get task
PATCH  /api/v1/tasks/:taskId           Update task
PATCH  /api/v1/tasks/:taskId/complete  Mark complete
DELETE /api/v1/tasks/:taskId           Delete task
```

### Inbox (Instagram)
```
GET    /api/v1/inbox/instagram         List conversations (filter: status, assignedTo)
GET    /api/v1/inbox/instagram/:conversationId   Get conversation
GET    /api/v1/inbox/instagram/:conversationId/messages  List messages (cursor-paginated)
POST   /api/v1/inbox/instagram/:conversationId/messages  Send message
PATCH  /api/v1/inbox/instagram/:conversationId/assign    Assign conversation
PATCH  /api/v1/inbox/instagram/:conversationId/status    Update status (open/closed)
POST   /api/v1/inbox/instagram/:conversationId/lead      Create/link lead from conversation
```

### Inbox (WhatsApp)
```
GET    /api/v1/inbox/whatsapp          List WhatsApp conversations
GET    /api/v1/inbox/whatsapp/:conversationId
GET    /api/v1/inbox/whatsapp/:conversationId/messages
POST   /api/v1/inbox/whatsapp/:conversationId/messages
POST   /api/v1/inbox/whatsapp/:conversationId/template  Send template message
```

### Social Accounts
```
GET    /api/v1/social/instagram        List connected Instagram accounts
POST   /api/v1/social/instagram/connect   OAuth connect flow initiate
GET    /api/v1/social/instagram/callback  OAuth callback handler
DELETE /api/v1/social/instagram/:accountId  Disconnect account

GET    /api/v1/social/whatsapp         List connected WhatsApp accounts
POST   /api/v1/social/whatsapp/connect   Connect via phone number
DELETE /api/v1/social/whatsapp/:accountId
```

### Workflows
```
GET    /api/v1/workflows               List workflows
POST   /api/v1/workflows               Create workflow
GET    /api/v1/workflows/:workflowId   Get workflow definition
PATCH  /api/v1/workflows/:workflowId   Update workflow
DELETE /api/v1/workflows/:workflowId   Delete workflow
PATCH  /api/v1/workflows/:workflowId/activate    Enable workflow
PATCH  /api/v1/workflows/:workflowId/deactivate  Disable workflow
GET    /api/v1/workflows/:workflowId/executions  List executions
POST   /api/v1/workflows/:workflowId/test        Test workflow with sample data
```

### Analytics
```
GET    /api/v1/analytics/dashboard     KPI summary (period: 7d, 30d, 90d)
GET    /api/v1/analytics/leads         Lead analytics
GET    /api/v1/analytics/pipeline      Pipeline analytics
GET    /api/v1/analytics/team          Team performance
GET    /api/v1/analytics/revenue       Revenue analytics + forecast
GET    /api/v1/analytics/inbox         Inbox SLA analytics
```

### Notifications
```
GET    /api/v1/notifications           List (paginated, newest first)
GET    /api/v1/notifications/unread-count  Badge count
PATCH  /api/v1/notifications/:id/read  Mark one as read
POST   /api/v1/notifications/read-all  Mark all as read
DELETE /api/v1/notifications/:id       Delete notification
PATCH  /api/v1/notifications/preferences  Update notification settings
```

### Billing
```
GET    /api/v1/billing/subscription    Get current subscription
POST   /api/v1/billing/checkout        Create Stripe Checkout session
GET    /api/v1/billing/invoices         List invoices
GET    /api/v1/billing/invoices/:id     Get invoice PDF URL
POST   /api/v1/billing/portal          Create Stripe Customer Portal session
POST   /api/v1/billing/cancel          Cancel subscription
```

### Files
```
POST   /api/v1/files/upload-url        Get presigned upload URL
POST   /api/v1/files                   Confirm upload, create file record
DELETE /api/v1/files/:fileId           Delete file
```

### Webhooks (Inbound)
```
POST   /api/webhooks/instagram         Meta Instagram webhook receiver   [CANONICAL PATH — P0-5]
GET    /api/webhooks/instagram         Meta webhook verification challenge
# NOTE: configure THIS path in the Meta console and docs/SETUP.md. The variant
# /api/v1/instagram/webhook previously shown in SETUP.md is deprecated/incorrect.
# Webhook routes mount express.raw() BEFORE the global JSON parser so HMAC-SHA256
# signature verification can read the raw body (doc 19 §19.4).
POST   /api/webhooks/whatsapp          Meta WhatsApp webhook receiver
GET    /api/webhooks/whatsapp          Meta webhook verification challenge
POST   /api/webhooks/stripe            Stripe billing webhook receiver
```

---

## 10.8 Request/Response Contracts (Key Endpoints)

### POST /api/v1/leads

**Request Body:**
```json
{
  "firstName": "Rahul",
  "lastName": "Sharma",
  "email": "rahul@example.com",
  "phone": "+919876543210",
  "source": "INSTAGRAM_DM",
  "assignedToId": "uuid-of-user",
  "tags": ["interested", "hot-lead"],
  "customFields": {
    "budget": "500000",
    "propertyType": "2BHK"
  },
  "pipelineStageId": "uuid-of-stage"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-...",
    "organizationId": "org-uuid",
    "firstName": "Rahul",
    "lastName": "Sharma",
    "email": "rahul@example.com",
    "phone": "+919876543210",
    "source": "INSTAGRAM_DM",
    "status": "NEW",
    "aiScore": null,
    "assignedTo": {
      "id": "user-uuid",
      "firstName": "Arjun",
      "lastName": "Sales",
      "avatarUrl": "https://cdn.leados.app/avatars/arjun.jpg"
    },
    "tags": ["interested", "hot-lead"],
    "customFields": { "budget": "500000", "propertyType": "2BHK" },
    "createdAt": "2026-06-18T07:00:00.000Z",
    "updatedAt": "2026-06-18T07:00:00.000Z"
  }
}
```

---

### GET /api/v1/pipelines/:id (Kanban data)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "pipeline-uuid",
    "name": "Sales Pipeline",
    "currency": "INR",
    "stages": [
      {
        "id": "stage-1-uuid",
        "name": "New Lead",
        "position": 1,
        "color": "#6366f1",
        "probability": 10,
        "isWon": false,
        "isLost": false,
        "dealCount": 12,
        "totalValue": 2400000,
        "deals": [
          {
            "id": "deal-uuid",
            "title": "Rahul Sharma - 2BHK",
            "value": 200000,
            "aiScore": 78,
            "contact": { "id": "...", "firstName": "Rahul", "avatarUrl": null },
            "assignedTo": { "id": "...", "firstName": "Arjun" },
            "expectedCloseDate": "2026-07-15",
            "lastActivityAt": "2026-06-17T14:30:00.000Z",
            "tags": ["hot"]
          }
        ]
      }
    ]
  }
}
```

---

## 10.9 Rate Limiting Strategy

| Tier | Limit | Window |
|---|---|---|
| Auth endpoints (login, register) | 5 req | 15 min per IP |
| API general (authenticated) | 1,000 req | 15 min per org |
| API general (authenticated) | 100 req | 1 min per org |
| File upload | 50 req | 1 hour per org |
| Webhook endpoints | 10,000 req | 15 min per IP |
| AI endpoints | Varies by plan | Per hour per org |

**Rate Limit Headers on every response:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1718690400
Retry-After: 120  (only on 429 responses)
```
