// Internal event bus (INFRA-2.6). In-process EventEmitter for soft/UX events.
//
// DURABILITY CONVENTION (R-ARCH-3): events that DRIVE SIDE EFFECTS (workflows, billing,
// AI) must NOT rely on this in-process emitter alone — they also enqueue a durable BullMQ
// job. `emitDurable` encodes that convention. Sprint 1 ships the bus + convention; domain
// producers/consumers arrive with their modules.

import { EventEmitter } from 'node:events';
import type { EventName } from '@leados/shared';
import { enqueue } from '../queue/queues.js';
import type { QueueName } from '../queue/names.js';
import { logger } from '../observability/logger.js';

export interface EventEnvelope<T = unknown> {
  event: EventName;
  payload: T;
  emittedAt: string;
}

class EventBus {
  private readonly emitter = new EventEmitter();

  on<T = unknown>(event: EventName, handler: (envelope: EventEnvelope<T>) => void): void {
    this.emitter.on(event, handler);
  }

  /** Soft, in-process emit (UX/realtime). Lost on crash — do not use for side effects. */
  emit<T = unknown>(event: EventName, payload: T): void {
    const envelope: EventEnvelope<T> = { event, payload, emittedAt: new Date().toISOString() };
    this.emitter.emit(event, envelope);
  }

  /**
   * Durable emit: enqueues a BullMQ job AND emits in-process. Use for any event that
   * triggers a side effect, so a crash between emit and handler cannot drop the trigger.
   */
  async emitDurable<T = unknown>(
    event: EventName,
    payload: T,
    queue: QueueName,
    jobName: string,
  ): Promise<void> {
    try {
      await enqueue(queue, jobName, { event, payload });
    } catch (err) {
      logger.error({ message: 'emitDurable enqueue failed', event, error: String(err) });
      throw err;
    }
    this.emit(event, payload);
  }
}

export const eventBus = new EventBus();
