// Cron registry (INFRA-3.1). Every scheduled job is declared here with its cadence, owner,
// idempotency note, and "what breaks if it doesn't run". Sprint 1 ships the mechanism with
// an EMPTY registry — real crons (IG token refresh, trial lifecycle, AI re-score, purge,
// audit-partition rollover, Stripe reconciliation) are added with their modules.

export interface CronDefinition {
  /** Stable unique id — also the BullMQ jobId, which makes scheduling single-flight. */
  id: string;
  /** Cron expression (UTC). */
  cron: string;
  owner: string;
  idempotency: string;
  failureImpact: string;
}

export const CRON_REGISTRY: CronDefinition[] = [
  {
    id: 'instagram-token-refresh',
    cron: '0 3 * * *', // 03:00 UTC daily
    owner: 'instagram-module',
    idempotency: 'BullMQ jobId = id; repeat key ensures a single scheduled job per id',
    failureImpact:
      'Instagram access tokens expire ~60 days after connection. If not refreshed within 7 days of expiry the account moves to EXPIRED status and agents lose inbox access until the admin reconnects.',
  },
  {
    id: 'ai-scoring-sweep',
    cron: '0 4 * * *', // 04:00 UTC daily
    owner: 'system',
    idempotency: 'BullMQ jobId = id; repeat key ensures a single scheduled job per id',
    failureImpact: 'Stale leads will not have updated AI scores, potentially missing high-intent conversion signals.',
  },
  {
    id: 'followup-sweep',
    cron: '0 * * * *', // hourly
    owner: 'tasks-module',
    idempotency: 'BullMQ jobId = id; repeat key ensures a single scheduled job per id',
    failureImpact:
      'Stale leads and overdue deals will not have automated follow-up tasks suggested, reducing sales team outreach efficiency.',
  },
  {
    id: 'billing-reconciliation',
    cron: '0 2 * * *', // 02:00 UTC daily
    owner: 'billing-module',
    idempotency: 'BullMQ jobId = id; repeat key ensures a single scheduled job per id',
    failureImpact:
      'Subscriptions may drift from Stripe source of truth, causing access lock issues or delinquent usage.',
  },
];
