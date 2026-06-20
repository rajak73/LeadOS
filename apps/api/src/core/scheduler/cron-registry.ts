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
];
