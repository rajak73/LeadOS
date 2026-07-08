# Phase 12E Walkthrough: Billing Quota Enforcement

## What Was Accomplished
1. **Dynamic Usage Tracking**: Updated `billing.service.ts` to compute actual database counts for `leads`, `deals`, `users`, and `workflows` for an organization.
2. **Quota Exposer**: Updated the `/api/v1/billing/subscription` endpoint (via the service) to return these usage statistics alongside the subscription details.
3. **Frontend Integration**: Updated the React `useSubscription` hook to type-check and return the new usage object.
4. **Billing Dashboard**: Replaced the hardcoded usage stats (e.g. 342 leads) with live, dynamic metrics on the Settings > Billing page.
5. **Enforcement and Error Handling**: 
   - Verified that `lead.service.ts` enforces `PLAN_LIMIT_EXCEEDED` errors when attempting to create leads beyond the subscription quota.
   - Updated the `CreateLeadModal` to explicitly catch `PLAN_LIMIT_EXCEEDED` errors from the BFF and show a user-friendly upgrade prompt using a toast notification instead of a generic failure message.

## Verification
- Backend usage calculation correctly identifies exact counts from the database for the active tenant.
- Settings > Billing UI now matches the tenant's exact database usage.
- Hitting a plan limit when converting a conversation to a Lead now correctly triggers a graceful upgrade prompt rather than a generic error.

## Next Steps
This concludes the remaining non-Meta tasks. The core CRM and AI fallback are fully implemented and demo-ready. We are still blocked on Phase 11C (Meta App credentials).
