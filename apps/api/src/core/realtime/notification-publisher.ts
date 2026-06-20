// Cross-process realtime notification publisher for the Worker process.
//
// The Worker has no Socket.io server. Instead it uses @socket.io/redis-emitter to publish
// events into the same Redis channel that the API's Socket.io redis-adapter is subscribed to.
// All API instances receive the message and broadcast to their local `org:{id}` room.
//
// `initNotificationPublisher()` must be called before startWorkers() in worker.ts.
// The API process uses emitToOrg() from socket-server.ts directly (in-process, no Redis hop).

import IORedis from 'ioredis';
import { Emitter } from '@socket.io/redis-emitter';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';

let emitter: Emitter | null = null;

export function initNotificationPublisher(): void {
  const redisClient = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  emitter = new Emitter(redisClient);
  logger.info('Notification publisher (redis-emitter) initialised');
}

/**
 * Publish a realtime event to an organisation's room from the Worker process.
 * API instances receive via redis-adapter and forward to connected clients.
 */
export function notifyOrg(organizationId: string, event: string, payload: unknown): void {
  if (!emitter) {
    throw new Error('Notification publisher not initialised — call initNotificationPublisher() first');
  }
  emitter.to(`org:${organizationId}`).emit(event, payload);
}
