// Socket.io client stub (UI-1.2). The realtime tier (org rooms, inbox/notification events)
// connects on auth — wired in S2/S6. Sprint 1 ships the connection factory only; it is not
// auto-connected.
'use client';

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000';
    socket = io(url, { autoConnect: false, transports: ['websocket'] });
  }
  return socket;
}
