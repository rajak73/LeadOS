# 15 — WhatsApp Integration

---

## 15.1 Architecture: Meta Cloud API (Recommended)

**Chosen Approach: Meta WhatsApp Cloud API (No BSP)**

| Option | Cost | Control | Complexity | Decision |
|---|---|---|---|---|
| BSP (Business Solution Provider) | $0.01–$0.05/msg (markup) | Low (vendor lock-in) | Low | ❌ |
| Meta Cloud API (direct) | Meta's rates only | Full | Medium | **✅ Chosen** |
| On-premise API | Infra cost | Full | Very High | ❌ |

**Why Cloud API:**
- No markup from BSP
- Direct control over message delivery
- No infra to manage
- Better rate limits
- Free conversation model (user-initiated = free for 24h)

---

## 15.2 WhatsApp Business Account Setup

**Requirements per org:**
1. Facebook Business Manager account (verified)
2. WhatsApp Business Account (WABA)
3. Phone number (not registered on personal WhatsApp)
4. Display name approved by Meta
5. Business category, description

**WABA Registration Flow:**
```
[1] User enters phone number in LeadOS Settings → WhatsApp
[2] LeadOS initiates WABA registration via Embedded Signup (Meta Business SDK)
    (Meta provides iframe-based flow — no Meta Developer App needed by user)
[3] Meta verifies the phone number (OTP via SMS or call)
[4] WABA created, phone number registered
[5] LeadOS stores: phoneNumberId, businessAccountId, accessToken
[6] Subscribe to webhooks
[7] Account status: CONNECTED
```

**Embedded Signup (recommended for SaaS):**
Use Meta's Embedded Signup flow to allow users to connect their WABA without leaving LeadOS. This requires:
- LeadOS app has Business Management permission
- Frontend integrates Meta's JS SDK for embedded flow
- LeadOS receives System User token on completion

---

## 15.3 Conversation Tracking

### WhatsApp Conversation Types & Billing

**Conversation Categories (Meta's billing model):**
| Type | Initiated By | Free Window | Cost |
|---|---|---|---|
| Service | Customer (user sends first) | 24 hours from last user message | **Free** |
| Marketing | Business | N/A | Per conversation |
| Utility | Business (transactional) | N/A | Per conversation |
| Authentication | Business (OTP) | N/A | Per conversation |

**Critical Design Decision:** 
- LeadOS must track `windowExpiresAt` on each conversation
- If window is open (< 24h since last customer message) → agent can send free-form messages
- If window is closed → agent must send an approved template message
- UI must show "Window expires in 2h 15m" warning to agents

### Conversation Tracking Schema
```typescript
interface WhatsAppConversation {
  // ...existing fields...
  windowExpiresAt: Date | null;  // 24h from last inbound message
  conversationCategory: 'SERVICE' | 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  billedConversationId: string | null; // Meta's billing reference
}
```

---

## 15.4 Message Receive Flow

```
[1] Customer sends WhatsApp message to business number

[2] Meta POSTs webhook to /api/webhooks/whatsapp:
    {
      "object": "whatsapp_business_account",
      "entry": [{
        "id": "{WABA_ID}",
        "changes": [{
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": { "phone_number_id": "{PHONE_ID}" },
            "contacts": [{ "wa_id": "{CUSTOMER_PHONE}", "profile": { "name": "Priya Nair" } }],
            "messages": [{
              "id": "{MESSAGE_ID}",
              "from": "{CUSTOMER_PHONE}",
              "timestamp": "1718690400",
              "type": "text",
              "text": { "body": "Hello, I want to enquire about the apartment" }
            }]
          }
        }]
      }]
    }

[3] Webhook verified (HMAC-SHA256) → stored as WebhookEvent → 200 OK

[4] Worker processes event:
    a. Find WhatsAppAccount by phoneNumberId
    b. Find or create WhatsAppConversation by externalPhone
    c. Update windowExpiresAt = now + 24h (customer sent message = open window)
    d. Create Message record
    e. Find or create Lead (source: WHATSAPP)

[5] Workflow evaluation triggered

[6] WebSocket push to assigned agent
```

---

## 15.5 Template Message Architecture

### Template Types
- **Marketing**: Promotional content (requires opt-in)
- **Utility**: Transactional (order confirmations, appointment reminders)
- **Authentication**: OTP codes

### Template Management
```
[1] Admin creates template in LeadOS Settings → WhatsApp Templates
[2] LeadOS submits template to Meta for approval via API:
    POST https://graph.facebook.com/v18.0/{WABA_ID}/message_templates
    {
      "name": "appointment_reminder",
      "language": "en",
      "category": "UTILITY",
      "components": [
        {
          "type": "HEADER",
          "format": "TEXT",
          "text": "Your appointment is confirmed! 🏥"
        },
        {
          "type": "BODY",
          "text": "Hi {{1}}, your appointment with Dr. {{2}} is scheduled for {{3}} at {{4}}. Reply CONFIRM to confirm or CANCEL to cancel.",
          "example": { "body_text": [["Priya", "Meena Kapoor", "June 20", "3:00 PM"]] }
        },
        {
          "type": "FOOTER",
          "text": "LeadOS - Powered by [Clinic Name]"
        },
        {
          "type": "BUTTONS",
          "buttons": [
            { "type": "QUICK_REPLY", "text": "Confirm" },
            { "type": "QUICK_REPLY", "text": "Cancel" }
          ]
        }
      ]
    }
[3] Meta returns template status: PENDING → APPROVED (typically 24-48h)
[4] LeadOS stores template with status in DB
[5] Approved templates available in:
    a. Workflow actions (auto-send)
    b. Agent inbox (manual send when window closed)
```

### Template Sending
```typescript
// When window is closed or for proactive outreach:
POST https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages
{
  "messaging_product": "whatsapp",
  "to": "{CUSTOMER_PHONE}",
  "type": "template",
  "template": {
    "name": "appointment_reminder",
    "language": { "code": "en" },
    "components": [{
      "type": "body",
      "parameters": [
        { "type": "text", "text": "Priya" },
        { "type": "text", "text": "Dr. Meena Kapoor" },
        { "type": "text", "text": "June 20, 2026" },
        { "type": "text", "text": "3:00 PM" }
      ]
    }]
  }
}
```

---

## 15.6 Free-Form Message Sending (Within 24h Window)

```typescript
POST https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages
{
  "messaging_product": "whatsapp",
  "to": "{CUSTOMER_PHONE}",
  "type": "text",
  "text": { "body": "Hi Priya! I've attached the floor plan as requested." }
}
```

**With media:**
```typescript
{
  "messaging_product": "whatsapp",
  "to": "{CUSTOMER_PHONE}",
  "type": "image",
  "image": { "link": "https://cdn.example.com/floor-plan.jpg" }
}
```

---

## 15.7 Message Status Tracking

WhatsApp sends delivery/read status webhooks:
```json
{
  "statuses": [{
    "id": "{MESSAGE_ID}",
    "status": "delivered | read | failed",
    "timestamp": "1718690400",
    "recipient_id": "{CUSTOMER_PHONE}"
  }]
}
```

LeadOS updates Message.status accordingly:
`SENT → DELIVERED → READ` or `SENT → FAILED`

---

## 15.8 WhatsApp Billing Impact

### Meta's Pricing (Approximate — changes frequently)
| Category | Cost per Conversation (India) |
|---|---|
| Service (customer-initiated) | Free |
| Marketing | ~$0.012 |
| Utility | ~$0.004 |
| Authentication | ~$0.005 |

**Free Tier:** First 1,000 service conversations per month per WABA are free.

### LeadOS Billing Strategy
- LeadOS does NOT mark up WhatsApp messaging costs
- WhatsApp API costs are passed directly to the org (they pay Meta directly)
- LeadOS charges flat subscription fee for platform access
- Usage dashboard shows: conversations used this month, billing category breakdown
- Warning when approaching Meta's free tier limit

### Cost Control Tools in LeadOS
- Template approval workflow (prevents accidental mass sends)
- Daily sending limits (configurable by Admin)
- Window expiry warnings (prevent triggering paid templates unnecessarily)
- Broadcast limits: max 50 template messages per hour via LeadOS

---

## 15.9 WhatsApp Broadcast (Bulk Messaging)

For marketing campaigns:
```
[1] Admin creates broadcast: select template + audience segment
[2] Audience: leads/contacts filtered by tags, status, source
[3] Preview: shows estimated messages, cost estimate
[4] Approval required (Manager or above)
[5] Scheduled or immediate send
[6] BullMQ sends via rate-limited queue (max 50 msg/sec per WABA)
[7] Delivery tracking report generated
```

**Compliance requirements:**
- Only send marketing templates to opted-in contacts
- Include opt-out mechanism in every broadcast
- Honor opt-out within 24 hours
- Store opt-in/opt-out records with timestamp (GDPR)

---

## 15.10 Error Handling

| Error | Meta Code | Handling |
|---|---|---|
| Invalid recipient | 131047 | Mark contact as invalid, notify agent |
| User blocked business | 131031 | Close conversation, note on lead |
| Template not approved | 132007 | Show error in UI, prompt to wait for approval |
| Sending outside window (no template) | 131026 | Show "24h window expired" in UI |
| Daily messaging limit | 130429 | Queue and retry after limit resets |
| Phone quality rating low | - | Notify admin, suggest reducing opt-out rate |
