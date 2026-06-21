// Instagram Send Worker — Sprint 6 M4.
//
// Processes INSTAGRAM_SEND_JOB jobs from the instagram-send queue.
// Sequence: load account → decrypt token → call Meta adapter → update message status.
// Rate-limited per igAccountId via BullMQ group rate limiter.

import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { prisma } from '../../prisma/client.js';
import { createQueueConnection } from '../../redis/client.js';
import { logger } from '../../observability/logger.js';
import { QUEUE } from '../names.js';
import { decryptField } from '../../crypto/field-encryption.js';
import { instagramAdapter } from '../../../modules/instagram/instagram.adapter.js';
import type { MessageContent } from '../../../modules/instagram/instagram.adapter.js';

export const INSTAGRAM_SEND_JOB = 'instagram-send';

export interface InstagramSendJobPayload {
  organizationId: string;
  conversationId: string;
  messageId: string;          // UUID of the messages row (created optimistically by service)
  recipientIgUserId: string;  // customer's IG user ID
  content: { text?: string };
  igAccountId: string;
}

export async function processInstagramSendJob(job: Job<InstagramSendJobPayload>): Promise<void> {
  const { organizationId, messageId, recipientIgUserId, content, igAccountId } = job.data;

  // Load account record (base prisma — cross-tenant lookup for decryption)
  const account = await prisma.instagramAccount.findFirst({
    where: { id: igAccountId, organizationId, deletedAt: null },
    select: { id: true, accessToken: true, status: true },
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

  let metaMid: string;
  try {
    const result = await instagramAdapter.sendMessage(recipientIgUserId, messageContent, plainToken);
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
  return new Worker(
    QUEUE.INSTAGRAM_SEND,
    async (job) => {
      if (job.name === INSTAGRAM_SEND_JOB) {
        return processInstagramSendJob(job as Job<InstagramSendJobPayload>);
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
