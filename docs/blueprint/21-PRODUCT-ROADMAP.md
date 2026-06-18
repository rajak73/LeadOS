# 21 — Product Roadmap

---

## Vision Statement for This Roadmap

LeadOS will grow from an MVP CRM into the **Revenue Operating System** that powers 25,000+ businesses.
Each version builds on the previous. No version ships with technical debt that blocks the next.

---

## Phase V1: Foundation (Months 1–4) — "Prove It Works"

### Goal: 500 paying organizations, $50K MRR

### Core Theme: Ship a product so good that the first 100 users tell 500 more.

### Features Shipping in V1

**Authentication & Org**
- [x] Email/password registration + email verification
- [x] JWT + refresh token auth
- [x] Multi-org support (user in multiple orgs)
- [x] Trial period (14 days, no card required)
- [x] Stripe integration (Starter + Growth plans)

**CRM Core**
- [x] Lead management (create, view, edit, assign, status, tags)
- [x] Lead import (CSV, up to 10K records)
- [x] Contact management (basic)
- [x] Activity timeline on Lead/Contact

**Pipeline**
- [x] Single pipeline per org (Starter)
- [x] Kanban drag-and-drop (dnd-kit)
- [x] Deal cards with value, assignee, stage
- [x] Deal detail page

**Social Inbox**
- [x] Instagram DM integration (OAuth + webhooks)
- [x] Unified inbox with conversation list + thread view
- [x] Send/receive Instagram DMs from LeadOS
- [x] Auto-create lead from new DM
- [x] Assign conversations to team members

**AI (Basic)**
- [x] AI Lead Scoring (runs on lead create + weekly refresh)
- [x] Score displayed on lead card and detail page

**Team**
- [x] Invite team members by email
- [x] 4 system roles (Owner, Admin, Manager, Sales Executive)
- [x] RBAC enforcement on all endpoints

**Workflow Automation (V1 — limited)**
- [x] 3 trigger types: Lead Created, Deal Won, Instagram Message Received
- [x] 3 action types: Create Task, Create Notification, Send Email
- [x] Up to 5 workflows per org (Starter)

**Analytics**
- [x] Dashboard KPIs (leads, deals, revenue)
- [x] Lead source breakdown (chart)
- [x] Basic pipeline view

**Settings**
- [x] Org settings
- [x] Instagram connection management
- [x] Notification preferences

### V1 Success Metrics
| Metric | Target |
|---|---|
| Registered orgs | 2,000 |
| Paying orgs | 500 |
| Trial conversion rate | 25% |
| Month 1 churn | < 5% |
| NPS score | > 40 |
| P95 API response | < 400ms |

---

## Phase V2: Scale (Months 5–9) — "Make It Indispensable"

### Goal: 5,000 paying organizations, $500K MRR

### Core Theme: Expand channels, deepen automation, make every user's team more efficient.

### V2 Features

**WhatsApp Integration**
- WhatsApp Business API (Meta Cloud API)
- Conversation tracking + 24h window management
- Template message management + Meta approval workflow
- Free-form messaging within window
- WhatsApp broadcast (bulk template sending to segments)

**Advanced Workflow Engine**
- 10 trigger types (all defined in blueprint)
- 10 action types (including WhatsApp send, Instagram DM, Webhook)
- Condition logic (AND/OR chains)
- Wait/delay node in workflow
- Visual drag-and-drop flow builder (React Flow)
- Workflow template library (10 pre-built templates)
- Execution history and audit log

**Multiple Pipelines**
- Up to 5 pipelines (Growth plan)
- Pipeline-specific analytics
- Cross-pipeline deal view

**AI Expansion**
- Sentiment analysis on conversations (displayed in inbox)
- Follow-up recommendations on Lead Detail page
- Conversation AI summary (auto-generated on conversation close)
- Opportunity detection (stale deal alerts, score jump alerts)

**Contact Management (Enhanced)**
- Full contact 360° view (equal to Lead detail)
- Lifetime value tracking
- Contact merge (duplicate resolution)
- Custom fields per contact

**Analytics (Advanced)**
- Stage velocity analysis
- Conversion funnel per pipeline
- Team performance dashboard
- Revenue forecast (weighted pipeline + AI-enhanced)
- Inbox SLA analytics
- Custom date ranges

**Integrations (V2)**
- Email integration: 2-way Gmail/Outlook sync (IMAP/OAuth)
- Zapier connector (LeadOS as trigger/action)
- CSV scheduled export (weekly digest email)
- Webhook outbound events (notify external systems)

**Mobile Web (Responsive)**
- Inbox fully responsive (agents reply on mobile)
- Lead/deal view on mobile
- Push notifications via PWA

### V2 Success Metrics
| Metric | Target |
|---|---|
| Paying orgs | 5,000 |
| MRR | $500K |
| Avg revenue per org | $100/month |
| Monthly churn | < 3% |
| NPS score | > 50 |
| WhatsApp adoption | 40% of Growth/Scale orgs |

---

## Phase V3: Enterprise (Months 10–18) — "Own the Category"

### Goal: 25,000 paying organizations, $3M MRR

### Core Theme: Enterprise readiness, API platform, global expansion.

### V3 Features

**Native Mobile Apps (iOS + Android)**
- Full inbox functionality
- Push notifications (lead assigned, message received)
- Offline drafts for messages

**Public REST API (Scale Plan)**
- Full API access for Scale plan orgs
- API key management with scoped permissions
- Rate limits + usage dashboard
- Developer documentation (Swagger UI)
- Webhook subscriptions (org can subscribe to events)

**Advanced AI**
- Revenue forecasting with historical ML model
- AI email composer (GPT-4o draft emails based on lead context)
- AI conversation coach: real-time suggestions while typing DM replies
- Predictive churn risk scoring (which deals are about to be lost)
- AI-powered bulk lead enrichment (company info, social profiles)

**Email Marketing Module**
- Drip email sequences (multi-step, timed)
- Email templates with visual editor (WYSIWYG)
- Email open/click tracking
- Unsubscribe management
- Send from custom domain

**Advanced Team Features**
- Custom roles (Scale plan: create roles with granular permissions)
- Teams/groups (sub-groups within org for regional separation)
- Manager overrides: manager can reply on behalf of team member
- Shift management (assign inbox by time of day)

**Marketplace & Integrations**
- Native HubSpot migration import
- Native Zoho import
- Native Google Contacts sync
- Shopify integration (orders linked to contacts)
- Calendly integration (meeting booking via lead detail)
- Meta Ads integration (connect ad account, see which ad generated lead)

**Enterprise Security (Scale+)**
- SAML 2.0 SSO (Google Workspace, Microsoft Azure AD, Okta)
- IP allowlist (restrict access to company VPN)
- Custom data retention policies
- HIPAA Business Associate Agreement (for clinics)
- SOC 2 Type II certification
- DPA (Data Processing Agreement) available

**Global Expansion**
- Multi-language UI (Hindi, Arabic, Spanish, Portuguese)
- Multi-currency (full: USD, EUR, AED, BRL)
- Data residency: EU region for European customers
- WhatsApp in 20+ countries
- Telegram integration (Russia/Eastern Europe markets)

**Developer Platform**
- LeadOS App Marketplace (third-party integrations)
- OAuth 2.0 for third-party apps
- Webhook delivery with retries and delivery logs

### V3 Success Metrics
| Metric | Target |
|---|---|
| Paying orgs | 25,000 |
| MRR | $3M ARR target |
| Scale plan orgs | 500 |
| API developer accounts | 200 |
| Countries with 50+ orgs | 10 |
| NPS score | > 55 |

---

## Milestone Timeline

```
Month 1  ─── V1 Development Sprint 1: Auth, Org, Lead CRUD
Month 2  ─── V1 Development Sprint 2: Pipeline, Team, RBAC
Month 3  ─── V1 Development Sprint 3: Instagram, Inbox, AI Scoring
Month 4  ─── V1 Beta Launch: 50 design partners, iterate
Month 4  ─── V1 Public Launch: Product Hunt, social launch
Month 5  ─── V2 Sprint 1: WhatsApp, Advanced Workflows
Month 6  ─── V2 Sprint 2: AI Expansion, Multiple Pipelines
Month 7  ─── V2 Sprint 3: Advanced Analytics, Email Integration
Month 8  ─── V2 Launch: Growth plan launch, $100K MRR target
Month 9  ─── V2 Stabilization: Performance, reliability, support
Month 10 ─── V3 Sprint 1: Mobile Apps, Public API
Month 12 ─── V3 Sprint 2: Email Marketing, Enterprise Security
Month 14 ─── V3 Sprint 3: Marketplace, Global Expansion
Month 15 ─── V3 Launch: Enterprise sales motion begins
Month 18 ─── SOC 2 Type II certification achieved
```

---

## Technical Debt Policy

At every sprint, 20% of engineering capacity is allocated to:
- Performance optimization
- Test coverage improvement
- Documentation updates
- Security patching
- Refactoring (prevent architectural debt)

**Principle:** No feature ship if test coverage < 70% for that module.
**Principle:** No database migration in production without rollback script tested.
**Principle:** No breaking API change without 3-month deprecation notice.

---

## Team Hiring Plan (Against Roadmap)

| Phase | Engineering | Product | Design | Sales | CS |
|---|---|---|---|---|---|
| V1 | 3 full-stack engineers | 1 PM (founder) | 1 designer | - | - |
| V2 | +2 engineers (5 total) | 1 PM | 1 designer | 2 AEs | 1 CSM |
| V3 | +5 engineers (10 total) | 2 PMs | 2 designers | 5 AEs | 3 CSMs |
| Scale | Engineering teams by domain | - | - | Enterprise AEs | Enterprise CS |
