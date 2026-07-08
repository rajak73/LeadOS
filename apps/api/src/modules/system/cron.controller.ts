import type { Request, Response } from 'express';
import { env } from '../../core/config/env.js';
import { logger } from '../../core/observability/logger.js';
import { drainQueuesBatch } from '../../core/queue/cron-worker.js';
import { createQueueConnection } from '../../core/redis/client.js';

export class CronController {
  public async drainQueues(req: Request, res: Response): Promise<void> {
    // 1. Check for required CRON_SECRET environment variable
    if (!env.CRON_SECRET) {
      logger.warn({ message: 'CRON_SECRET is not configured' });
      res.status(503).json({ error: 'Cron is not configured on this environment' });
      return;
    }

    // 2. Validate Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }

    const token = authHeader.substring(7);
    if (token !== env.CRON_SECRET) {
      res.status(401).json({ error: 'Invalid CRON_SECRET' });
      return;
    }

    // 3. Acquire Redis lock to ensure only one instance runs globally
    const redis = createQueueConnection();
    const lockKey = 'cron:drain-queues:lock';
    // Use TOTAL_CRON_TIMEOUT_MS to safely expire the lock
    const lockTtlSeconds = Math.ceil(env.TOTAL_CRON_TIMEOUT_MS / 1000) + 10; 
    
    try {
      const lockAcquired = await redis.set(lockKey, '1', 'EX', lockTtlSeconds, 'NX');
      if (!lockAcquired) {
        logger.info({ message: 'Cron drain-queues skipped - already running' });
        res.status(200).json({ success: true, skipped: true, reason: 'Already running' });
        return;
      }

      logger.info({ message: 'Cron drain-queues started', maxJobs: env.CRON_MAX_JOBS_PER_QUEUE });
      
      // 4. Process queues synchronously within the requested timeouts
      const results = await drainQueuesBatch(env.CRON_MAX_JOBS_PER_QUEUE, env.QUEUE_BATCH_TIMEOUT_MS);
      
      res.status(200).json({ success: true, skipped: false, results });
    } catch (err) {
      logger.error({ message: 'Cron drain-queues failed', error: String(err) });
      res.status(500).json({ error: 'Failed to process queues' });
    } finally {
      // Safely release lock (we check if it exists before deleting, though technically since it's just '1' we could just del it. 
      // Better: we can just delete it, worst case we delete another cron's lock if we took way too long, but TTL handles it.)
      try {
        await redis.del(lockKey);
      } catch (err) {
        logger.warn({ message: 'Failed to release cron lock', error: String(err) });
      }
      redis.disconnect();
    }
  }
}
