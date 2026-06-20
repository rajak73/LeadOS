// Socket.io authentication middleware.
//
// Clients must send the access JWT as a handshake auth token:
//   socket = io(url, { auth: { token: '<jwt>' } })
//
// On success the socket gets socket.data = { userId, organizationId, role }.
// On failure the connection is rejected with an error message (not a JSON response —
// Socket.io handshake errors are delivered via the connect_error event).

import type { Socket } from 'socket.io';
import { verifyAccessToken } from '../auth/jwt.js';

interface SocketData {
  userId: string;
  organizationId: string;
  role: string;
}

export function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void,
): void {
  const token = (socket.handshake.auth as Record<string, unknown>)?.token;
  if (typeof token !== 'string' || !token) {
    next(new Error('AUTH_REQUIRED'));
    return;
  }
  try {
    const claims = verifyAccessToken(token);
    (socket.data as SocketData) = {
      userId: claims.sub,
      organizationId: claims.orgId,
      role: claims.role,
    };
    next();
  } catch {
    next(new Error('INVALID_TOKEN'));
  }
}
