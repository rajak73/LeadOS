# Sprint 6 M1-A — Meta API Spike Findings

**Status:** PLACEHOLDER — findings to be completed during Sprint 6 M2 (Meta API integration)

This document will capture the findings from the Meta Graph API spike that informs M2–M5 implementation.

## Questions to Answer

1. **Messaging window**: Confirm the exact 24-hour window behaviour for Instagram DMs (standard vs ephemeral messaging window).
2. **Webhook event structure**: Confirm the exact JSON shape of `messaging` webhook events (message, message_read, message_echo).
3. **Token refresh**: Does Meta support long-lived token refresh for Instagram Business accounts? What is the token TTL?
4. **Rate limits**: What are the Graph API rate limits for message send (`POST /v19.0/me/messages`)?
5. **Webhook subscription**: Which fields must be subscribed (`messages`, `messaging_postbacks`, etc.) in the App Dashboard?
6. **Media handling**: Supported attachment types and size limits for INBOUND media messages.
7. **User IDs**: Confirm that `sender.id` in webhook events is the IGSID (scoped to the Page, not the global IG user ID).

## Findings

*To be completed during M2 implementation spike.*

## Impact on M2–M5 Implementation

*To be filled in after spike. Any deviations from M1 architectural assumptions must be flagged here and reviewed before M2 approval.*
