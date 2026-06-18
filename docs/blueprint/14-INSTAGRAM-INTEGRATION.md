# 14 — Instagram Integration

> **⚠ UPDATED per `docs/planning/P0_FIXES.md` (P0-5).** The flows in this document (Facebook-Page-linked Graph API v18, `pages_*` scopes, Page Access Tokens, 7-day window) are written against a Meta API model that may be deprecated. **They are ILLUSTRATIVE and MUST be validated by a pre-build spike against the CURRENT Meta API** before the Sprint-6 build. The specific endpoints, scopes, token types/lifetimes, messaging-window duration, and webhook field names are subject to that validation. All Meta specifics are encapsulated behind a swappable Instagram channel-adapter interface. Consolidated architecture: `docs/planning/FINAL_ARCHITECTURE.md`.

---

## 14.0 Pre-Build Validation Spike (MANDATORY, before Sprint 6)

Before implementing this integration, run a 2–3 day spike against a live Meta test app on the **current** API to confirm:
- The correct OAuth flow: "Instagram API with **Instagram Login**" vs Facebook-Login / Page-linked — and the exact scopes.
- Which **token type** is used for messaging and its **true lifetime** (resolving the §14.5/§14.6 Page-token-vs-60-day-refresh inconsistency).
- The real **messaging-window** duration (historically 24h standard + a human-agent tag, NOT the 7 days stated in §14.10).
- Current **webhook field names / payload shapes** and the message-level idempotency key.

Output: an errata patch to this document reflecting reality, plus confidence that Meta App Review can clear. The inbox build (Sprint 6) is **blocked on this spike**. Facebook Business verification (a slow prerequisite) is started immediately, and App Review is submitted at the earliest demonstrable point — it gates public launch.

**Channel-adapter abstraction:** all functions below (connect, subscribe-webhook, receive, send, refresh-token, fetch-profile) are accessed through an `InstagramAdapter` interface so the concrete API version/flow is swappable and the inbox/workflow layers never bind to Meta's wire format. The Graph API version is pinned and tracked for deprecation.

---

## 14.1 Architecture Overview

LeadOS uses the **Meta Graph API** (Instagram Messaging API) to:
1. Receive incoming DMs via webhooks
2. Send outbound DMs on behalf of connected Instagram accounts
3. Enrich lead profiles with Instagram user data
4. Sync conversation history

**Meta Platform Prerequisites:**
- Facebook Developer App (type: Business)
- Required products: Instagram, Webhooks
- App must go through Meta App Review
- Connected Instagram accounts must be Business or Creator accounts
- Each Instagram Business Account must be connected to a Facebook Page

---

## 14.2 OAuth Connect Flow

```
[1] User clicks "Connect Instagram" in Settings
      ↓
[2] Frontend redirects to Meta OAuth URL:
    https://www.facebook.com/v18.0/dialog/oauth
      ?client_id={APP_ID}
      &redirect_uri={CALLBACK_URL}
      &scope=instagram_basic,instagram_manage_messages,pages_show_list,pages_read_engagement
      &state={csrf_token}  ← CSRF protection
      &response_type=code
      ↓
[3] User logs into Facebook + grants permissions
      ↓
[4] Meta redirects to:
    https://app.leados.com/oauth/instagram/callback?code={AUTH_CODE}&state={csrf_token}
      ↓
[5] Frontend validates state (CSRF check)
      ↓
[6] Frontend POSTs code to: POST /api/v1/social/instagram/connect
      ↓
[7] Backend exchanges code for short-lived access token:
    GET https://graph.facebook.com/v18.0/oauth/access_token
      ?client_id={APP_ID}&client_secret={APP_SECRET}
      &redirect_uri={CALLBACK_URL}&code={AUTH_CODE}
      ↓
[8] Backend exchanges for long-lived token (60-day):
    GET https://graph.facebook.com/v18.0/oauth/access_token
      ?grant_type=fb_exchange_token&client_id={}&client_secret={}&fb_exchange_token={SHORT_LIVED}
      ↓
[9] Backend gets list of Facebook Pages user manages:
    GET https://graph.facebook.com/v18.0/me/accounts
      ↓
[10] For each Page, get linked Instagram Business Account:
     GET https://graph.facebook.com/v18.0/{page-id}?fields=instagram_business_account
      ↓
[11] Get Page Access Token (doesn't expire):
     GET https://graph.facebook.com/v18.0/{page-id}?fields=access_token
      ↓
[12] Store: InstagramAccount record with encrypted Page Access Token
      ↓
[13] Subscribe account to webhooks (see 14.3)
      ↓
[14] Return connected account info to frontend
```

---

## 14.3 Webhook Setup Flow

After OAuth, subscribe the page to Meta webhooks:

```
POST https://graph.facebook.com/v18.0/{page-id}/subscribed_apps
  ?subscribed_fields=messages,messaging_optins,message_deliveries,message_reads
  &access_token={PAGE_ACCESS_TOKEN}
```

**Webhook Verification (one-time):**
```
GET /api/webhooks/instagram
  ?hub.mode=subscribe
  &hub.challenge=<random_number>
  &hub.verify_token=<our_secret_token>

Response: 200 OK with body = hub.challenge value
```

**Verify Token:** Store as `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` env var. Must match what's configured in Meta Developer Console.

---

## 14.4 Message Receive Flow

```
[1] User sends DM to connected Instagram Business Account

[2] Meta POSTs webhook payload to /api/webhooks/instagram:
    {
      "object": "instagram",
      "entry": [{
        "id": "{PAGE_ID}",
        "time": 1718690400,
        "messaging": [{
          "sender": { "id": "{INSTAGRAM_SCOPED_USER_ID}" },
          "recipient": { "id": "{PAGE_ID}" },
          "timestamp": 1718690400000,
          "message": {
            "mid": "{MESSAGE_ID}",
            "text": "Hi, I'm interested in the 2BHK property"
          }
        }]
      }]
    }

[3] Webhook middleware:
    a. Validates X-Hub-Signature-256 header (HMAC-SHA256)
    b. Saves raw payload to webhook_events table (status: PENDING)
    c. Returns 200 OK immediately (Meta requires response within 20 seconds)

[4] BullMQ job: processInstagramMessage
    a. Dequeue from webhook_events
    b. Find InstagramAccount by recipient.id (page ID)
    c. Find Organization from InstagramAccount
    d. Find or create InstagramConversation by instagramScopedUserId
    e. Create Message record (direction: INBOUND)
    f. Update conversation.lastMessageAt

[5] Check idempotency: if message.mid already exists in messages table → skip

[6] Lead/Contact linking:
    a. Check if instagramScopedUserId matches any existing Lead.instagramUserId
    b. If YES → link conversation to existing lead
    c. If NO → create new Lead (source: INSTAGRAM_DM, status: NEW)

[7] Fetch Instagram user profile (for lead enrichment):
    GET https://graph.facebook.com/v18.0/{IGSID}
      ?fields=name,profile_pic
      &access_token={PAGE_ACCESS_TOKEN}

[8] AI scoring job enqueued for the lead

[9] Workflow evaluation triggered (event: INSTAGRAM_MESSAGE_RECEIVED)

[10] WebSocket push to assigned agent (or all agents if unassigned)

[11] Mark webhook_event as PROCESSED
```

---

## 14.5 Message Send Flow

```
[1] Agent types reply in LeadOS inbox + clicks Send

[2] POST /api/v1/inbox/instagram/{conversationId}/messages
    Body: { "type": "TEXT", "content": "Hi Rahul! I'll send you the brochure shortly." }

[3] Backend creates Message record (direction: OUTBOUND, status: SENT)

[4] BullMQ job: sendInstagramMessage
    POST https://graph.facebook.com/v18.0/me/messages
    Headers: { Authorization: Bearer {PAGE_ACCESS_TOKEN} }
    Body: {
      "recipient": { "id": "{INSTAGRAM_SCOPED_USER_ID}" },
      "message": { "text": "Hi Rahul! I'll send you the brochure shortly." }
    }

[5] Meta responds with: { "message_id": "{MID}" }

[6] Update Message record: externalMessageId = MID

[7] WebSocket push to conversation participants: message confirmed

[8] On webhook delivery confirmation:
    Message status updated: DELIVERED → READ
```

---

## 14.6 Token Refresh Flow

> **P0-5 note:** §14.5 describes messaging via a non-expiring Page Access Token while this
> section refreshes a 60-day long-lived user token — an inconsistency. The §14.0 spike
> determines exactly which token messaging depends on and its true lifetime; the refresh
> cron and the "account EXPIRED → notify owner → reconnect" UX are wired to that token.
> The encrypted-token storage format carries a version prefix so the token type/format can
> change without a big-bang re-encrypt.

**Page Access Tokens** (used for messaging) do not expire as long as:
- The user who granted permission hasn't changed their password
- The app's permissions haven't been revoked

**Long-lived User Tokens** expire after 60 days. Refresh strategy:
```
[Cron: daily at 3am]
  → Find all InstagramAccounts where accessTokenExpiresAt < 15 days from now
  → For each:
    GET https://graph.facebook.com/v18.0/oauth/access_token
      ?grant_type=fb_exchange_token
      &client_id={APP_ID}
      &client_secret={APP_SECRET}
      &fb_exchange_token={CURRENT_TOKEN}
  → Update token + reset expiry to +60 days
  → If refresh fails → mark account status: EXPIRED
  → Send notification to org Owner: "Your Instagram connection needs to be renewed"
```

---

## 14.7 Webhook Signature Verification

**Every webhook POST must be verified before processing:**

```typescript
// core/middleware/webhookVerifier.ts

export const verifyInstagramWebhook = (req: Request): boolean => {
  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) return false;
  
  const [, hash] = signature.split('=');
  const rawBody = req.rawBody; // Must be buffered before JSON parse
  
  const expectedHash = crypto
    .createHmac('sha256', process.env.INSTAGRAM_APP_SECRET!)
    .update(rawBody)
    .digest('hex');
  
  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(expectedHash, 'hex')
  );
};
```

---

## 14.8 Error Handling

| Error Scenario | Handling |
|---|---|
| Token expired during send | Mark account EXPIRED, notify owner, surface error in UI |
| User blocked the IG account | Mark conversation as BLOCKED, surface in UI |
| Meta API rate limit (200 calls/hour/page) | BullMQ rate limiter: max 150/hour with burst protection |
| Invalid recipient (user deleted) | Mark conversation CLOSED, note on lead |
| Webhook delivery failure (our server) | Meta retries for 12 hours, idempotency key prevents duplicates |
| Duplicate webhook (Meta may send twice) | Dedup by `message.mid` — skip if already in DB |

---

## 14.9 App Review Requirements

**Permissions required for Meta App Review:**

| Permission | Justification |
|---|---|
| `instagram_basic` | Read Instagram account info for connection |
| `instagram_manage_messages` | Read and send Instagram DMs on behalf of business |
| `pages_show_list` | List Facebook Pages to find linked Instagram accounts |
| `pages_read_engagement` | Read Page info for webhook setup |
| `pages_messaging` | Send messages via Facebook Page |

**App Review Submission Requirements:**
1. Screen recording of complete OAuth + DM flow
2. Privacy Policy URL (must explicitly mention Instagram data usage)
3. Terms of Service URL
4. Business verification (Facebook Business Manager)
5. Use case description: "LeadOS is a CRM platform that allows businesses to manage Instagram DMs as part of their sales pipeline. We need messaging permission to read and reply to incoming DMs on behalf of connected business accounts."
6. Test credentials for Meta reviewer (demo org with connected IG account)

**Data Use Policy:**
- Never store raw message content beyond 2 years
- Never use message data to train models
- Honor user data deletion requests (Instagram DM data purged within 30 days of request)
- Never sell Instagram messaging data to third parties

---

## 14.10 Limitations & Constraints

| Constraint | Details |
|---|---|
| Messaging window | Free-form sends allowed only within the standard window after the last user message. **The duration (commonly 24h + a human-agent message tag, NOT 7 days) MUST be confirmed by the §14.0 spike** and encoded as the adapter's window rule. |
| After window closes | Sends are blocked except where a permitted message tag applies; the UI must surface "window expired" explicitly (do not fail silently). |
| Message templates | Not available on Instagram (unlike WhatsApp) |
| Supported message types | Text, Image, Video (< 8MB), Audio, Sticker |
| No group messaging | Instagram API only supports 1:1 DMs |
| Story replies | Can receive story replies as messages |
| Comment replies | Comment automation possible but separate API flow |
| Hashtag/mention triggers | Available via webhook: mentions in stories, posts |
