# PHASE 12F — FOUNDER DEMO READINESS RUNBOOK

## 1. Approved Scope
This phase serves strictly to deliver a final Founder/Demo Readiness Package. It documents what works, what is simulated, what is blocked, and provides a safe local demo script. No new features, real API integrations, or deployments were executed.

## 2. Current Project Status
The internal CRM mechanics are **~90% code-complete** and **fully demo-ready**. The remaining 10% is entirely blocked by external API credentials (Stripe, Meta, OpenAI) which the founder must provide to cross the finish line.

## 3. What Is Demo Ready
The following features are completely functional and ready for demonstration:
- **Auth**: Full JWT-based sign up, login, and token refresh.
- **Multi-tenant organization isolation**: Users only see data belonging to their organization.
- **Super Admin dashboard**: Global visibility to manage tenants and system health.
- **Leads**: Creation, status updates, editing, importing.
- **Customers / Contacts**: Conversion from leads, contact management.
- **Deals / Pipeline**: Kanban boards, drag-and-drop movement, revenue forecasting.
- **Tasks**: Activity feed and task assignment.
- **Inbox simulation**: The frontend inbox fully loads simulated conversation threads.
- **Social lead capture simulation**: You can simulate an incoming webhook to trigger lead capture.
- **Cron queue workaround**: A robust HTTP-based trigger handles background jobs.
- **Demo data**: Safely seeds realistic B2B SaaS demo data for testing.
- **Billing live usage metrics**: The billing dashboard accurately queries the database for live tenant usage counts.
- **Billing quota enforcement**: The backend correctly throws `PLAN_LIMIT_EXCEEDED` and the frontend gracefully prompts an upgrade instead of failing.
- **AI Draft fallback**: The AI logic is wired, with a deterministic fallback to `MockAiAdapter` allowing the UX to be tested without an API key.

## 4. What Is Simulated
- **Instagram/WhatsApp messages**: The frontend displays simulated threads, but no real messages are transmitted to Meta.
- **AI draft generation**: The backend immediately returns a mock generic response when you click "💡 AI Draft", as no real OpenAI/Gemini key is present.
- **Stripe checkout/payment**: The billing portal is mocked. You cannot process real credit cards until Stripe keys are added.

## 5. What Is Blocked
- **Meta Developer App**: Needed for real Instagram/WhatsApp messaging.
- **Instagram Business / Facebook Page**: Needed as the target messaging endpoints.
- **WhatsApp Cloud API test number**: Needed for sending WhatsApp messages.
- **Stripe keys/products/webhook**: Needed to transition from mock quotas to real SaaS revenue.
- **OpenAI/Gemini API key**: Needed for real AI drafting.

## 6. Local Demo Setup
Ensure you have the following installed locally:
- Node.js (v20+ recommended)
- pnpm
- Docker (for local Postgres & Redis via `docker-compose`)

Ensure `.env` contains the local database and redis URLs, and that `API_INTERNAL_URL=http://localhost:5001` is present. Next.js in `apps/web` must symlink this `.env`.

## 7. Local Run Commands
Run these commands in separate terminal tabs from the project root:

1. **Start Database & Redis**
   ```bash
   docker-compose up -d
   ```

2. **Start API Backend**
   ```bash
   pnpm --filter @leados/api dev
   ```

3. **Start Next.js Frontend**
   ```bash
   pnpm --filter @leados/web dev
   ```

## 8. Demo Login / Test User Notes
You can log in using the seed users if you have run the demo data seeder.
**Owner/Admin**: `owner@technova.demo` (Password: `password123`)
**Manager**: `manager@technova.demo` (Password: `password123`)
**Sales Rep**: `sales@technova.demo` (Password: `password123`)
**Super Admin**: `admin@leados.demo` (Password: `password123`)

## 9. Demo Flow Script
Follow the paths below to show off the platform's capabilities safely.

## 10. Super Admin Demo Flow
1. Log in as `admin@leados.demo`.
2. Navigate to the **Super Admin** dashboard.
3. Show the global list of tenant Organizations.
4. Note that tenant data is globally visible here, proving the platform's multi-tenant architecture is ready for SaaS scaling.

## 11. Org Admin Demo Flow
1. Log out, and log in as `owner@technova.demo`.
2. Navigate to **Settings > Team**.
3. Show the organization-specific roles (Owner, Manager, Sales).
4. Emphasize that the user cannot see data from any other organization.

## 12. CRM Demo Flow
1. Navigate to **Leads**. Show filtering, searching, and creating a new lead.
2. Navigate to **Pipeline**. Demonstrate dragging and dropping a Deal card across stages. Note how the forecasted revenue updates.
3. Navigate to **Customers**. Show how a won deal results in a persistent customer profile.

## 13. Billing Quota Demo Flow
1. Navigate to **Settings > Billing**.
2. Show the **Live Usage Metrics** (e.g., 250/1000 Leads). 
3. Explain that if the user attempts to create a lead beyond their quota, a graceful upgrade prompt appears, blocking creation to enforce monetization.

## 14. AI Draft Demo Flow
1. Navigate to a task or a simulated inbox conversation.
2. Click the **"💡 AI Draft"** button.
3. The UI will render a mock AI response. 
4. Explain to the audience: *"The architecture is fully wired. We are just using a mock adapter right now. Once we plug in an OpenAI key, this button instantly returns real AI generations."*

## 15. Inbox Simulation Demo Flow
1. Navigate to **Inbox**.
2. Show the simulated chat threads (Instagram, WhatsApp).
3. Explain that the routing and UI are finished, and await the final Meta API webhook connection.

## 16. What Not To Claim In Demo
- Do not claim that AI is currently generating live intelligent text (it is mocked).
- Do not claim that you can process real credit cards today.
- Do not claim that live Instagram messages are currently reaching the phone.

## 17. Known Limitations
- Background jobs require an external cron trigger (`cron-job.org` pointing to `/api/v1/cron/process`) because Render free-tier does not support background workers.
- There is a known, minor UX gap where the "💡 AI Draft" button might not visually disable perfectly when toggled off via `FLAG_AI_SCORING_ENABLED`, but the backend safely blocks it regardless.

## 18. Troubleshooting
- **502 Bad Gateway / Fetch Failed**: Ensure your Next.js app has access to `API_INTERNAL_URL=http://localhost:5001`. (A symlink from `apps/web/.env` to the root `.env` fixes this).
- **Database Connection Error**: Ensure Docker is running.

## 19. Safety Notes
- **Never** commit `.env` to Git.
- **Never** run `npx prisma db push` against the Neon production database unless making authorized schema changes.
- **Never** show your Render dashboard environment variables on screen during a demo.

## 20. Next Decision Options
The CRM is complete. Choose one of the following to unblock the final 10%:
1. **Meta Setup**: Create the Meta Developer App to unblock Inbox messages.
2. **Stripe Setup**: Configure Stripe keys to unblock real billing.
3. **AI Provider Setup**: Provide OpenAI/Gemini keys to unblock real AI text.
