// Queue accessors (INFRA-2.5). Queues are created lazily and memoized so importing this
// module does not open Redis connections.

import { Queue } from 'bullmq';
import { createQueueConnection } from '../redis/client.js';
import { DEFAULT_JOB_OPTIONS, type QueueName } from './names.js';

const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: createQueueConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queues.set(name, q);
  }
  return q;
}

export async function enqueue<T>(
  name: QueueName,
  jobName: string,
  data: T,
  opts?: import('bullmq').JobsOptions
): Promise<string | undefined> {
  const job = await getQueue(name).add(jobName, data, opts);
  return job.id;
}

export async function queueDepth(name: QueueName): Promise<number> {
  const q = getQueue(name);
  const counts = await q.getJobCounts('waiting', 'active', 'delayed');
  return (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}
