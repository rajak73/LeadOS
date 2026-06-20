// Queue registry (doc 06 §6.5). All 8 business queues are DEFINED here with their
// concurrencies; their Workers are registered by the owning module in later sprints.
// Sprint 1 additionally runs a `system` queue to prove the API → queue → worker topology.

export const QUEUE = {
  WORKFLOW_EXECUTION: 'workflow-execution',
  EMAIL_DELIVERY: 'email-delivery',
  AI_SCORING: 'ai-scoring',
  WEBHOOK_PROCESSING: 'webhook-processing',
  NOTIFICATION_DELIVERY: 'notification-delivery',
  INSTAGRAM_SEND: 'instagram-send',
  WHATSAPP_SEND: 'whatsapp-send',
  DATA_EXPORT: 'data-export',
  LEAD_IMPORT: 'lead-import',
  LEAD_EXPORT: 'lead-export',
  SYSTEM: 'system',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

export const QUEUE_CONCURRENCY: Record<QueueName, number> = {
  'workflow-execution': 10,
  'email-delivery': 20,
  'ai-scoring': 5,
  'webhook-processing': 30,
  'notification-delivery': 15,
  'instagram-send': 10,
  'whatsapp-send': 10,
  'data-export': 3,
  'lead-import': 2,
  'lead-export': 2,
  system: 5,
};

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 1000,
};
