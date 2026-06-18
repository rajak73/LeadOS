// Demo job that proves the API → queue → separate-worker topology (M0).
// The API enqueues `health-echo`; the worker process consumes it and records a metric.
// This is platform plumbing, not a domain feature.

import { enqueue } from '../queues.js';
import { QUEUE } from '../names.js';

export const HEALTH_ECHO_JOB = 'health-echo';

export interface HealthEchoPayload {
  nonce: string;
  enqueuedAt: string;
}

export async function enqueueHealthEcho(nonce: string): Promise<string | undefined> {
  const payload: HealthEchoPayload = { nonce, enqueuedAt: new Date().toISOString() };
  return enqueue(QUEUE.SYSTEM, HEALTH_ECHO_JOB, payload);
}

/** Pure processing logic for the demo job (also unit-tested directly). */
export function processHealthEcho(payload: HealthEchoPayload): { ok: true; nonce: string } {
  if (!payload?.nonce) {
    throw new Error('health-echo payload missing nonce');
  }
  return { ok: true, nonce: payload.nonce };
}
