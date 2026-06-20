// Socket.io server with Redis adapter for multi-instance broadcast.
//
// Usage:
//   import { initSocketServer, emitToOrg } from './socket-server.js';
//   const server = app.listen(port);
//   initSocketServer(server);
//
// All authenticated sockets join room `org:{organizationId}` (via socket-middleware).
// emitToOrg() broadcasts to that room — the Redis adapter fans out to all API instances.
//
// IMPORTANT: cacheRedis has keyPrefix:'cache:' and MUST NOT be used as the adapter client;
// the Socket.io wire protocol keys would be double-prefixed and invisible to other instances.
// Two fresh IORedis instances (pub/sub) are created here without any prefix.

import type { IncomingMessage, Server, ServerResponse } from 'http';
import IORedis from 'ioredis';
import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { env } from '../config/env.js';
import { socketAuthMiddleware } from './socket-middleware.js';
import { logger } from '../observability/logger.js';

let io: SocketServer | null = null;

export function initSocketServer(
  httpServer: Server<typeof IncomingMessage, typeof ServerResponse>,
): SocketServer {
  const corsOrigins = env.SOCKET_IO_CORS_ORIGIN
    ? env.SOCKET_IO_CORS_ORIGIN.split(',').map((s) => s.trim())
    : [env.APP_WEB_ORIGIN];

  io = new SocketServer(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    transports: ['websocket'],
    path: '/ws',
  });

  // Redis pub/sub clients without keyPrefix — see module header.
  const pubClient = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  const subClient = pubClient.duplicate();

  io.adapter(createAdapter(pubClient, subClient));

  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    const orgId: string = (socket.data as { organizationId: string }).organizationId;
    void socket.join(`org:${orgId}`);
    logger.debug({ message: 'socket connected', socketId: socket.id, orgId });

    socket.on('disconnect', (reason) => {
      logger.debug({ message: 'socket disconnected', socketId: socket.id, orgId, reason });
    });
  });

  logger.info({ message: 'Socket.io server initialised', corsOrigins });
  return io;
}

export function getSocketServer(): SocketServer {
  if (!io) throw new Error('Socket.io server not initialised — call initSocketServer() first');
  return io;
}

/**
 * Broadcast a realtime event to all sockets in an organisation's room.
 * Safe to call without verifying whether any sockets are connected.
 */
export function emitToOrg(organizationId: string, event: string, payload: unknown): void {
  getSocketServer().to(`org:${organizationId}`).emit(event, payload);
}
