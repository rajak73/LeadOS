// Instagram Send Worker — Sprint 6 M4.
//
// Processes INSTAGRAM_SEND_JOB jobs from the instagram-send queue.
// Sequence: per-account rate limit check → load account → decrypt token → call Meta adapter → update message status.
//
// Per-account rate limiting uses a Redis fixed-window counter keyed by igAccountId.
// One Instagram account cannot exhaust all 10 concurrency slots; jobs that exceed the
// window limit are moved to the BullMQ delayed queue (no retry attempt consumed) and
// re-picked after INSTAGRAM_SEND_RATE_WINDOW_MS ms.

import IORedis from 'ioredis';
import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { prisma } from '../../prisma/client.js';
import { createQueueConnection } from '../../redis/client.js';
import { env } from '../../config/env.js';
import { logger } from '../../observability/logger.js';
import { QUEUE } from '../names.js';
import { decryptField } from '../../crypto/field-encryption.js';
import { instagramAdapter } from '../../../modules/instagram/instagram.adapter.js';
import type { MessageContent } from '../../../modules/instagram/instagram.adapter.js';

export const INSTAGRAM_SEND_JOB = 'instagram-send';

// Conservative per-account limits — update from Meta API spike findings (SPRINT_6_M1_SPIKE_FINDINGS.md).
// Meta documents ~200 messages/hour/account; these defaults are tighter to protect against
// worker-level burst exhaustion before Meta responds.
export const INSTAGRAM_SEND_RATE_MAX = 5;          // max sends per window per account
export const INSTAGRAM_SEND_RATE_WINDOW_MS = 1000; // fixed window in ms (1 second)

export interface InstagramSendJobPayload {
  organizationId: string;
  conversationId: string;
  messageId: string;          // UUID of the messages row (created optimistically by service)
  recipientIgUserId: string;  // customer's IG user ID
  content: { text?: string };
  igAccountId: string;
}

// Atomic Lua script: fixed-window INCR + PEXPIRE on first increment.
// Returns the counter value after increment. TTL is only set on the first call in the window
// so subsequent calls in the same window do not reset the expiry.
const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export function rateLimitKey(igAccountId: string): string {
  return `rl:ig-send:${igAccountId}`;
}

/**
 * Increment the per-account fixed-window counter and return whether the send is allowed.
 * Returns true when count <= max (send allowed); false when over the limit for this window.
 * Exported for direct testing.
 */
export async function checkAccountRateLimit(
  igAccountId: string,
  redis: IORedis,
  max = INSTAGRAM_SEND_RATE_MAX,
  windowMs = INSTAGRAM_SEND_RATE_WINDOW_MS,
): Promise<boolean> {
  const count = (await redis.eval(
    RATE_LIMIT_LUA,
    1,
    rateLimitKey(igAccountId),
    String(windowMs),
  )) as number;
  return count <= max;
}

export async function processInstagramSendJob(
  job: Job<InstagramSendJobPayload>,
  token: string | undefined,
  rateLimitRedis: IORedis,
): Promise<void> {
  const { organizationId, messageId, recipientIgUserId, content, igAccountId } = job.data;

  // Per-account rate limit — prevents one account exhausting all 10 concurrency slots.
  // Fail-open on Redis errors: Meta API is the final rate-limit authority.
  let allowed = true;
  try {
    allowed = await checkAccountRateLimit(igAccountId, rateLimitRedis);
  } catch (err) {
    logger.warn({
      message: 'instagram-send: rate limit check failed (Redis error), proceeding',
      igAccountId,
      messageId,
      error: String(err),
    });
  }

  if (!allowed) {
    logger.debug({
      message: 'instagram-send: rate limited — moving job to delayed',
      igAccountId,
      messageId,
      delayMs: INSTAGRAM_SEND_RATE_WINDOW_MS,
    });
    // moveToDelayed does not consume a retry attempt — the job re-queues cleanly.
    await job.moveToDelayed(Date.now() + INSTAGRAM_SEND_RATE_WINDOW_MS, token);
    return;
  }

  // Load account record (base prisma — cross-tenant lookup for decryption)
  const account = await prisma.instagramAccount.findFirst({
    where: { id: igAccountId, organizationId, deletedAt: null },
    select: { id: true, accessToken: true, status: true, platform: true },
  });

  if (!account || account.status !== 'ACTIVE') {
    logger.warn({ message: 'instagram-send: account not found or inactive', igAccountId, messageId });
    await prisma.message.update({ where: { id: messageId }, data: { status: 'FAILED' } });
    return; // do not retry — account problem is not transient
  }

  let plainToken: string;
  try {
    plainToken = decryptField(account.accessToken);
  } catch (err) {
    logger.warn({ message: 'instagram-send: token decryption failed', igAccountId, messageId, error: String(err) });
    await prisma.message.update({ where: { id: messageId }, data: { status: 'FAILED' } });
    return;
  }

  const messageContent: MessageContent = {
    type: 'text',
    ...(content.text !== undefined ? { text: content.text } : {}),
  };

  // Phase 9D: Simulation Mode bypass
  const simulateOnly = !env.INSTAGRAM_APP_SECRET || env.FLAG_INSTAGRAM_SENDS_ENABLED === false;
  if (simulateOnly) {
    logger.info({ message: 'Simulated outbound send', igAccountId, recipientIgUserId, type: messageContent.type });
    await prisma.message.update({
      where: { id: messageId },
      data: { status: 'SENT' },
    });
    return;
  }

  let metaMid: string;
  try {
    const result = await instagramAdapter.sendMessage(
      recipientIgUserId, 
      messageContent, 
      plainToken, 
      account.platform as 'INSTAGRAM' | 'FACEBOOK'
    );
    metaMid = result.mid;
  } catch (err) {
    const isLastAttempt = job.attemptsMade >= ((job.opts.attempts ?? 1) - 1);
    logger.warn({
      message: 'instagram-send: Meta API call failed',
      igAccountId, messageId, attemptsMade: job.attemptsMade, error: String(err),
    });
    if (isLastAttempt) {
      await prisma.message.update({ where: { id: messageId }, data: { status: 'FAILED' } });
    }
    throw err; // BullMQ will retry
  }

  // Update message row with Meta's mid (replaces our local_ prefix UUID)
  await prisma.message.update({
    where: { id: messageId },
    data: { mid: metaMid, status: 'SENT' },
  });

  logger.info({ message: 'instagram-send: message sent', messageId, metaMid, recipientIgUserId });
}

export function createInstagramSendWorker(): Worker {
  const rateLimitRedis = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  return new Worker(
    QUEUE.INSTAGRAM_SEND,
    async (job, token) => {
      if (job.name === INSTAGRAM_SEND_JOB) {
        return processInstagramSendJob(
          job as Job<InstagramSendJobPayload>,
          token,
          rateLimitRedis,
        );
      }
      logger.warn({ message: 'instagram-send: unknown job name', jobName: job.name });
      return undefined;
    },
    {
      connection: createQueueConnection(),
      concurrency: 10,
    },
  );
}
