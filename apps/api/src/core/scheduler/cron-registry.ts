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
  // (empty in Sprint 1)
];
