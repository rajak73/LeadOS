# EXTERNAL INTEGRATION BLOCKER TRACKER

## 1. Current External Integration Status
The LeadOS platform is functionally complete (90%) but strictly blocked from entering production readiness (100%) due to missing external API credentials. 

## 2. Meta Blocker
**Status**: BLOCKED. 
The Founder has not created the Meta Developer App, which means real Instagram and WhatsApp messages cannot be received or sent.

## 3. Stripe Blocker
**Status**: BLOCKED. 
The Founder has not configured Stripe API keys. The billing system correctly limits quotas, but real payments cannot be collected.

## 4. AI Provider Blocker
**Status**: BLOCKED.
The Founder has not configured OpenAI or Gemini API keys. The AI Draft feature correctly falls back to a Mock adapter.

## 5. Required Env Variable Names Only
The following environment variables must be populated securely in the `.env` (local) and Render Dashboard (production). **DO NOT paste values in chat.**

### Meta
- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`
- `INSTAGRAM_OAUTH_REDIRECT_URI`
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
- `META_APP_SECRET`
- `META_WHATSAPP_VERIFY_TOKEN`
- `META_WHATSAPP_PHONE_ID`
- `META_API_VERSION`
- `FLAG_INSTAGRAM_SENDS_ENABLED`
- `FLAG_WHATSAPP_SENDS_ENABLED`

### Stripe
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_GROWTH`
- `STRIPE_PRICE_ENTERPRISE`

### AI
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `FLAG_AI_SCORING_ENABLED`

## 6. Founder Actions Required
The Founder must log into Meta, Stripe, and OpenAI to generate the respective API keys, configure necessary webhooks on the provider dashboards, and inject the keys into the local/staging `.env` and Render production dashboard.

## 7. Agent Actions After Founder Completes Setup
Once authorized, the agent will:
1. Verify the webhooks can successfully reach the API.
2. Replace mock adapters with real provider SDKs.
3. Conduct end-to-end testing (e.g., sending a test Instagram DM, processing a test Stripe card).

## 8. Security Rules
- Do not commit `.env` to Git.
- Do not print real secrets into the AI chat interface.
- Keep webhook verify tokens private.

## 9. What To Say When Ready
When you have finished configuring a service, copy the exact phrase below and paste it to the AI agent to authorize the next phase.

**For Meta:**
> Meta Developer setup is complete. Required env variables are configured securely in local/staging/Render. Do not print secrets. Proceed with Phase 11C test credential wiring and webhook verification.

**For Stripe:**
> Stripe test mode setup is complete. Required Stripe env variables are configured securely in local/staging/Render. Do not print secrets. Proceed with Stripe test checkout and webhook verification.

**For AI:**
> AI provider key is configured securely in local/staging/Render. Do not print secrets. Proceed with real AI provider test mode verification.
