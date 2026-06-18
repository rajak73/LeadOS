# 03 — Functional Requirements

---

## Module Map

```
LeadOS
├── Authentication & Identity
├── Organization Management
├── Contact & Lead Management
├── Pipeline & Deal Management
├── Social Inbox (Instagram + WhatsApp)
├── Workflow Automation Engine
├── AI Intelligence Layer
├── Task & Activity Management
├── Analytics & Reporting
├── Team & RBAC
├── Billing & Subscription
├── Notifications
└── Settings
```

---

## 3.1 Authentication & Identity

### FR-AUTH-001: User Registration
- User registers with email + password
- Email verification required before access
- Password: min 8 chars, must contain uppercase, number, special char
- On registration: org created or join-org flow triggered

### FR-AUTH-002: User Login
- Email + password authentication
- JWT Access Token (15 min expiry) + Refresh Token (7 day expiry)
- "Remember me" extends refresh token to 30 days
- Login rate limited to 5 attempts per 15 min (IP + email)

### FR-AUTH-003: Token Refresh
- Silent token refresh using refresh token rotation
- Old refresh token invalidated on use
- Token family tracking to detect token reuse attacks

### FR-AUTH-004: Password Reset
- Forgot password → email with reset link (1 hour expiry)
- Reset token is single-use
- Audit log entry on password change

### FR-AUTH-005: OAuth (Google SSO)
- Sign in with Google for workspace accounts
- Auto-link if email already exists

### FR-AUTH-006: Session Management
- User can view all active sessions
- User can revoke any session remotely
- All sessions revoked on password change

---

## 3.2 Organization Management

### FR-ORG-001: Organization Creation
- Created on first user registration
- Fields: name, slug (URL-safe, unique), industry, timezone, logo
- Slug used for: tenant routing, public booking pages

### FR-ORG-002: Organization Settings
- Update: name, logo, timezone, currency, language
- Business hours configuration (used for SLA calculations)
- Custom domain (future)

### FR-ORG-003: Organization Subscription
- Each org has one active subscription
- Subscription tier determines: seat limits, lead limits, automation limits
- Subscription managed by Owner only

### FR-ORG-004: Organization Deletion
- Soft delete: data retained for 30 days, then purged
- All members notified on deletion
- Stripe subscription cancelled automatically

---

## 3.3 Contact & Lead Management

### FR-LEAD-001: Lead Creation
- Manual creation with form
- Auto-creation from Instagram DM webhook
- Auto-creation from WhatsApp message
- Required fields: name (or Instagram handle), source, status
- Optional: phone, email, notes, tags, assigned user, custom fields

### FR-LEAD-002: Lead Status Lifecycle
```
NEW → CONTACTED → QUALIFIED → PROPOSAL → NEGOTIATION → WON | LOST
```
- Status changes logged to Activity feed
- Status change can trigger Workflow automation

### FR-LEAD-003: Lead Source Tracking
- Sources: Instagram DM, Instagram Comment, WhatsApp, Manual, Import, Web Form, Referral, Other
- Source stored and cannot be changed after creation
- Source visible on lead card and in analytics

### FR-LEAD-004: Lead Scoring Display
- AI score (0–100) shown as badge on lead card
- Score updated every time lead data changes
- Score breakdown tooltip: what drove the score

### FR-LEAD-005: Lead Assignment
- Assign to any team member
- Round-robin auto-assignment option per pipeline
- Assignment triggers notification to assignee

### FR-LEAD-006: Lead Import
- CSV import: up to 10,000 records per import
- Field mapping UI
- Duplicate detection on import (by email or phone)
- Import progress shown in real-time

### FR-LEAD-007: Lead Duplicate Detection
- System flags leads with matching email or phone
- User prompted to merge or ignore
- Merge combines activity history

### FR-LEAD-008: Contact (Customer) Upgrade
- When a lead is won, a Contact record is created or linked
- Lead history preserved on Contact record

### FR-LEAD-009: Custom Fields
- Org admins can create custom fields per object type
- Field types: text, number, date, select, multi-select, boolean, URL
- Up to 50 custom fields per object type

### FR-LEAD-010: Lead Tags
- Free-form tags with color labels
- Tags filterable in list view
- Bulk tag operations

### FR-LEAD-011: Lead List View
- Columns: Name, Source, Status, Score, Assigned To, Last Activity, Created At
- Sort by any column
- Filter by: status, source, score range, assigned user, date range, tags
- Search by name, email, phone
- Save filter presets
- Export to CSV

---

## 3.4 Pipeline & Deal Management

### FR-PIPELINE-001: Pipeline Creation
- Org can have multiple pipelines (e.g., "Sales", "New Patient", "Property Enquiry")
- Each pipeline has customizable stages
- Default stages auto-created on pipeline creation

### FR-PIPELINE-002: Stage Management
- Stages ordered with drag-and-drop
- Each stage has: name, color, win probability (0–100%), goal (optional)
- Mark stage as "Won" or "Lost" (terminal stages)
- Stage deletion moves deals to adjacent stage

### FR-PIPELINE-003: Deal Card
- Deal card shows: name, contact, value, stage, assignee, last activity, close date, score badge
- Color-coded by: health (green/yellow/red), stage, priority
- Quick actions on hover: call, email, move to next stage

### FR-PIPELINE-004: Kanban View
- Drag-and-drop cards between stages
- Stage header shows: deal count, total value
- Collapsed stages for focus mode
- Cards sorted by: score (default), value, last activity, close date
- Filter: by assignee, by tag, by value range

### FR-PIPELINE-005: List View
- Table view of all deals in pipeline
- Sortable columns
- Inline editing for stage, assignee, close date

### FR-PIPELINE-006: Deal Detail Page
- Overview: contact info, deal info, AI insights
- Activity timeline: all calls, emails, notes, messages
- Tasks panel: open tasks linked to deal
- Files panel: uploaded documents
- Notes panel: rich-text notes

### FR-PIPELINE-007: Deal Forecasting
- Weighted pipeline value = sum(deal value × stage probability)
- Forecast view: current month, next month, quarter
- Historical accuracy tracking

### FR-PIPELINE-008: Multiple Pipelines
- Starter: 1 pipeline | Growth: 5 pipelines | Scale: unlimited
- Each pipeline fully independent (stages, deals, settings)

---

## 3.5 Social Inbox

### FR-INBOX-001: Unified Inbox
- All channels in one view: Instagram DM, WhatsApp, Email
- Left panel: conversation list (sorted by last message, newest first)
- Right panel: full conversation thread
- Quick filters: All, Mine, Unread, Unassigned

### FR-INBOX-002: Conversation Assignment
- Each conversation assigned to one agent
- Unassigned conversations show in "Unassigned" tab
- Supervisors see all conversations
- Assignment can be manual or automatic (round-robin)

### FR-INBOX-003: Instagram DM View
- Full message history with timestamps
- Message status: sent, delivered, read (via Instagram API)
- Attach files (images) from LeadOS
- Quick replies (saved response templates)
- Link conversation to Lead or Contact

### FR-INBOX-004: WhatsApp View
- Message history with timestamps
- Message status: sent, delivered, read
- Send template messages (approved templates)
- Attach images, documents, voice notes
- Conversation window status (24h rule displayed)

### FR-INBOX-005: Inbox SLA Tracking
- First response time tracked per conversation
- SLA status shown (within SLA / breached)
- Manager dashboard: team SLA performance

### FR-INBOX-006: Saved Replies
- Pre-written quick reply templates
- Accessible via "/" shortcut while typing
- Org-level and personal templates

### FR-INBOX-007: Conversation Labels
- Label conversations for categorization (e.g., "Interested", "Callback", "Complaint")
- Filter inbox by label
- Labels configured in Settings

### FR-INBOX-008: Lead Creation from Inbox
- Button to create new Lead from any conversation
- Lead pre-populated with conversation data
- Conversation linked to lead record

---

## 3.6 Workflow Automation Engine

### FR-WF-001: Workflow Creation
- Visual drag-and-drop flow builder
- Each workflow: Trigger → Conditions → Actions
- Named, with description and status (active/inactive)
- Workflows run per organization (tenant-isolated)

### FR-WF-002: Triggers
| Trigger | Description |
|---|---|
| Lead Created | Fires when any new lead is created |
| Lead Status Changed | Fires when lead moves between statuses |
| Deal Stage Changed | Fires when deal moves pipeline stage |
| Deal Won | Fires when deal marked as Won |
| Deal Lost | Fires when deal marked as Lost |
| Instagram Message Received | Fires on new DM |
| WhatsApp Message Received | Fires on new WhatsApp message |
| Task Overdue | Fires when task due date passes |
| Lead Score Changed | Fires when AI score changes by ±10 |
| Time Delay | Fires at specific time after trigger |

### FR-WF-003: Conditions
| Condition | Type |
|---|---|
| Lead Source equals [value] | Enum |
| Lead Status equals [value] | Enum |
| Lead Score is greater than [N] | Numeric |
| Assigned User equals [user] | Reference |
| Pipeline Stage equals [stage] | Reference |
| Tag includes [tag] | Array |
| Custom Field [field] equals [value] | Dynamic |
| Time of day is between [start] [end] | Time |
| Day of week is [day] | Day |

### FR-WF-004: Actions
| Action | Description |
|---|---|
| Send Email | Email via SendGrid to contact or team member |
| Send Instagram DM | Reply to conversation via Instagram API |
| Send WhatsApp Message | Send template message via WhatsApp API |
| Create Task | Create task assigned to specified user |
| Update Lead Field | Change a field value on the lead |
| Move Deal Stage | Move deal to specified stage |
| Assign Lead | Change lead assignment |
| Add Tag | Add tag to lead/contact |
| Create Notification | In-app notification to specified user |
| Wait / Delay | Wait N minutes/hours/days before next action |
| Webhook | POST payload to external URL |

### FR-WF-005: Workflow Execution
- Workflows run asynchronously via BullMQ queue
- Each execution logged with: input, output, timestamp, status
- Failed executions retried up to 3 times with exponential backoff
- Execution history visible per workflow

### FR-WF-006: Workflow Limits by Plan
| Plan | Max Workflows | Max Actions per Workflow | Monthly Executions |
|---|---|---|---|
| Starter | 5 | 5 | 1,000 |
| Growth | 25 | 10 | 10,000 |
| Scale | Unlimited | 20 | Unlimited |

---

## 3.7 Task & Activity Management

### FR-TASK-001: Task Creation
- Task fields: title, description, due date, priority, type, assigned user, linked object (lead/deal/contact)
- Types: Call, Email, Meeting, Follow-up, Demo, Other
- Priority: Low, Medium, High, Urgent

### FR-TASK-002: Task List Views
- My Tasks view: overdue, due today, due this week, upcoming
- Manager view: all team tasks by assignee
- Linked tasks visible on lead/deal/contact detail pages

### FR-TASK-003: Task Completion
- Mark complete with one click
- Completion auto-logged to linked record's Activity feed

### FR-TASK-004: Activity Feed
- Chronological timeline on every Lead/Deal/Contact
- Activity types: Lead created, Status changed, Deal moved, Message sent/received, Task created/completed, Note added, File uploaded, Call logged
- Activity entries are immutable (audit trail)

### FR-TASK-005: Notes
- Rich text notes (bold, italic, bullet, link) on any record
- Notes timestamped and attributed to author
- Notes searchable across organization

---

## 3.8 Analytics & Reporting

### FR-ANALYTICS-001: Dashboard Overview
- KPI cards: New Leads (period), Deals Won, Revenue Won, Pipeline Value, Avg Deal Size
- Lead source breakdown (donut chart)
- Pipeline health bar per stage
- Team leaderboard

### FR-ANALYTICS-002: Sales Performance Report
- Individual and team performance: leads contacted, deals won, revenue generated
- Comparison vs previous period
- Export as PDF or CSV

### FR-ANALYTICS-003: Pipeline Analytics
- Average time in each stage (velocity)
- Conversion rate per stage
- Drop-off analysis

### FR-ANALYTICS-004: Lead Analytics
- Lead volume by source, by status, by assignee
- Lead score distribution
- Lead age (time since creation without progression)

### FR-ANALYTICS-005: Revenue Forecast
- AI-powered forecast for current month/quarter
- Weighted pipeline vs best-case vs worst-case
- Historical accuracy of forecasts

### FR-ANALYTICS-006: Inbox Analytics
- Response time analysis by agent and by channel
- Message volume by channel and by day
- SLA breach rate

### FR-ANALYTICS-007: Workflow Analytics
- Executions per workflow (7d, 30d)
- Success rate
- Most triggered workflows

### FR-ANALYTICS-008: Custom Reports
- Growth tier: build custom reports from any data combination
- Save and schedule report delivery via email

---

## 3.9 Team & Settings

### FR-TEAM-001: Invite Member
- Send invitation by email
- Invitation link expires in 7 days
- Role selected at invite time

### FR-TEAM-002: Member Management
- View all members: name, email, role, status, last active
- Change member role (Owner/Admin only)
- Suspend member (preserves data, blocks login)
- Remove member (unassigns all leads, reassigns tasks)

### FR-TEAM-003: Seat Limits
- Plan enforces maximum seat count
- Attempting to invite beyond limit prompts upgrade

---

## 3.10 Notifications

### FR-NOTIF-001: Notification Types
- Lead assigned to me
- New message in my conversation
- Task overdue
- Deal won by team member
- Workflow execution failed
- Subscription payment failed
- Trial expiring

### FR-NOTIF-002: Delivery Channels
- In-app notification bell (real-time via WebSocket)
- Email digest (configurable: instant, hourly, daily)
- (Future) Push notification via mobile app

### FR-NOTIF-003: Notification Preferences
- Per-user control over which notification types are enabled
- Per-channel control (in-app vs email per type)
