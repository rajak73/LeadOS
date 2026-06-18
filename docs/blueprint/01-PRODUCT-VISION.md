# 01 — Product Vision, Mission & Market

---

## 1.1 Product Vision

**LeadOS is the Revenue Operating System for the Social-First Business Era.**

Where traditional CRMs were built for inside sales teams managing email and cold calls, LeadOS is built for the world where customers first appear in your Instagram DMs, WhatsApp messages, and social comments — and where the speed of response determines whether you close or lose the deal.

LeadOS collapses six separate tools (CRM, inbox, automation, analytics, AI assistant, billing) into one unified platform with a single data model, a single login, and a single source of truth for every customer relationship.

---

## 1.2 Mission Statement

> **"Give every business the revenue intelligence of an enterprise Fortune 500 company — at a price any agency, clinic, or coach can afford."**

We believe that:
- Small businesses and agencies should not be priced out of powerful CRM tooling.
- Social media is a first-class sales channel, not an afterthought.
- AI should remove administrative burden, not add complexity.
- A CRM should feel like a premium product, not enterprise software from 2008.

---

## 1.3 Market Opportunity

### Total Addressable Market (TAM)
- Global CRM market: **$128.97 billion by 2028** (CAGR 12.5%)
- Social Commerce market: **$1.2 trillion by 2025**
- Marketing Automation: **$8.42 billion by 2027**
- Combined addressable market for social-first CRM + automation: **~$35 billion**

### Serviceable Addressable Market (SAM)
- SMBs + agencies using social media as primary lead source: **~18 million globally**
- Average CRM spend per company: **$500–$5,000/year**
- SAM estimate: **~$9 billion/year**

### Serviceable Obtainable Market (SOM) — Year 1–3
- Target: 5,000 paying organizations in Year 1, 25,000 by Year 3
- Average revenue per org: $1,200/year
- Year 3 ARR target: **$30M**

### Market Gap Being Filled
| Problem | Current Solution | LeadOS Solution |
|---|---|---|
| Instagram DMs have no CRM tracking | Manual spreadsheets | Auto-capture + lead cards |
| Sales teams use 5+ separate tools | Disconnect & context-switching | Unified platform |
| CRMs are too complex for SMBs | HubSpot/Salesforce over-engineering | Simple, opinionated, fast |
| No AI scoring for social leads | None in SMB segment | Built-in AI scoring |
| Workflow automation is expensive | Zapier + HubSpot ($500+/mo) | Native automation engine |

---

## 1.4 Target Personas

### Persona 1 — "Agency Owner" (Primary)
**Name:** Arjun Shah  
**Role:** Founder, Digital Marketing Agency (8 employees)  
**Revenue:** ₹50L–₹2Cr/year  
**Pain Points:**
- Tracking 200+ leads from Instagram across 10 client accounts
- Losing leads because DMs are not responded to within the hour
- No visibility into which clients' deals are closing or stalling
- Paying separately for Zapier, a spreadsheet CRM, and email tools

**Goals:**
- See all client leads in one place with real-time social inbox
- Auto-assign new DMs to team members with response SLAs
- Report pipeline performance to clients monthly
- Reduce response time from hours to minutes

**Willingness to Pay:** ₹4,000–₹12,000/month for a complete platform

---

### Persona 2 — "Real Estate Sales Manager" (Primary)
**Name:** Priya Nair  
**Role:** Sales Manager, Mid-sized Real Estate Developer (25-agent team)  
**Revenue:** ₹5Cr–₹50Cr/year  
**Pain Points:**
- Agents using personal WhatsApp for lead follow-up (no visibility)
- Losing track of which property enquiry came from which campaign
- No single dashboard showing deal stages across all agents
- Manual reporting for weekly sales meetings

**Goals:**
- Every lead tagged with source (Instagram ad, walk-in, referral)
- Pipeline view showing active, stalled, and closed deals per agent
- AI-powered follow-up reminders for cold leads
- Automated WhatsApp drip campaigns for new property launches

**Willingness to Pay:** ₹15,000–₹40,000/month

---

### Persona 3 — "Clinic Owner" (Primary)
**Name:** Dr. Meena Kapoor  
**Role:** Owner, Aesthetic Dermatology Clinic (3 doctors, 5 staff)  
**Revenue:** ₹1.5Cr–₹5Cr/year  
**Pain Points:**
- Appointment enquiries arrive on Instagram, WhatsApp, and website simultaneously
- No one is tracking which enquiry converted to a booking
- No automated follow-up for patients who enquired but didn't book
- Sensitive patient data must be kept confidential

**Goals:**
- Unified inbox for all channels
- Auto-reply with appointment booking link when a DM arrives
- HIPAA-aware data handling for patient records
- Track "enquiry → consultation → treatment" funnel

**Willingness to Pay:** ₹6,000–₹18,000/month

---

### Persona 4 — "Coaching Institute Director" (Primary)
**Name:** Rakesh Verma  
**Role:** Director, EdTech Coaching Institute (online + offline, 5,000 students/year)  
**Pain Points:**
- Student enquiries via Instagram Reels comments and DMs
- Admissions team tracking leads on spreadsheets
- No automated follow-up for students who expressed interest but didn't enroll
- Seasonal peaks (admissions season) overwhelm the team

**Goals:**
- Auto-capture DM leads, tag with course interest
- Automated WhatsApp drip: syllabus, demo class invite, fee structure
- Pipeline showing Enquiry → Demo → Application → Enrolled
- Campaign performance: which Reel generated the most enrollments

**Willingness to Pay:** ₹8,000–₹20,000/month

---

### Persona 5 — "Insurance Advisor" (Secondary)
**Name:** Vijay Kumar  
**Role:** Independent Insurance Advisor / Small Insurance Agency  
**Revenue:** ₹20L–₹1Cr/year  
**Pain Points:**
- No structured follow-up system for policy renewals
- Referrals managed in WhatsApp groups
- Regulatory compliance: customer communication must be logged

**Goals:**
- Simple CRM with renewal reminders
- WhatsApp automation for policy anniversary wishes + upsell
- Lead scoring based on last contact date + policy value

**Willingness to Pay:** ₹2,000–₹6,000/month

---

## 1.5 User Journey Mapping

### Journey: New Lead from Instagram DM

```
[1] Prospect sends DM to business Instagram account
      ↓
[2] Instagram Webhook fires → LeadOS API receives event
      ↓
[3] System checks: Is this user already a Contact?
      ├── YES → Link message to existing Contact record
      └── NO  → Auto-create new Lead with status: "NEW"
      ↓
[4] AI Lead Scoring runs immediately (score 0–100)
      ↓
[5] Notification sent to assigned sales rep (in-app + email)
      ↓
[6] Sales rep opens Social Inbox → sees full conversation thread
      ↓
[7] Rep replies from LeadOS (message sent back via Instagram API)
      ↓
[8] If no reply in 30 min → Workflow trigger fires → auto-response DM
      ↓
[9] Rep qualifies lead → moves to Pipeline Stage "Qualified"
      ↓
[10] Follow-up task auto-created for 2 days later
      ↓
[11] Deal won → Customer converted → Subscription/Invoice created
```

---

### Journey: Team Member Onboarding

```
[1] Owner sends invite email from Team Settings
      ↓
[2] Invite email delivered with magic link (7-day expiry)
      ↓
[3] Team member clicks link → sets password → account created
      ↓
[4] Role assigned (Admin / Manager / Sales Executive)
      ↓
[5] Permissions automatically applied based on role
      ↓
[6] Team member lands on Dashboard → onboarding checklist shown
      ↓
[7] Onboarding tasks: Connect Instagram, Create first Pipeline, Add first Lead
```

---

### Journey: Trial → Paid Conversion

```
[1] Org signs up → 14-day free trial begins (no credit card)
      ↓
[2] Day 3: Usage summary email ("You've captured 12 leads this week!")
      ↓
[3] Day 10: Trial expiry warning email + upgrade CTA
      ↓
[4] Day 14: Trial expires → read-only mode
      ↓
[5] Owner clicks Upgrade → Stripe Checkout opens
      ↓
[6] Payment completes → subscription activated → full access restored
      ↓
[7] Welcome email with getting-started tips
```

---

## 1.6 Customer Lifecycle Model

```
AWARENESS
    ↓ (SEO, Instagram ads, word-of-mouth, partner referrals)
ACQUISITION
    ↓ (Website → Sign-up → Org created → Trial started)
ACTIVATION
    ↓ (First lead captured, first pipeline created, first team member invited)
    [Activation = completing 3 of 5 onboarding steps within 7 days]
RETENTION
    ↓ (Monthly active usage: leads added, deals moved, inbox used)
    [Health Score based on: DAU, leads/week, pipeline activity]
REVENUE
    ↓ (Trial → Paid, Starter → Growth → Scale upgrade)
REFERRAL
    ↓ (Partner program: 30% recurring commission, referral links)
EXPANSION
    ↓ (Add seats, unlock AI add-on, unlock WhatsApp, add more pipelines)
```

### Health Score Indicators (for CS team)
| Signal | Weight |
|---|---|
| Logged in this week | 20% |
| Leads added this week | 25% |
| Pipeline deals moved this week | 20% |
| Inbox messages replied | 20% |
| Team members active | 15% |

**Health Score < 40 for 14 days** → Trigger churn-risk alert for CS team.
