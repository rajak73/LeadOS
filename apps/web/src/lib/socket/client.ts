// Socket.io client — Sprint 6 M5.
// getSocket() creates the singleton (autoConnect: false) on first call.
// connectSocket(token) sets auth and connects if not already connected.
// disconnectSocket() disconnects (call on logout or unmount).
// useSocketEvent(event, handler) registers/unregisters a listener via React useEffect.
'use client';

import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000';
    socket = io(url, { autoConnect: false, transports: ['websocket'], path: '/ws' });
  }
  return socket;
}

export function connectSocket(token: string): void {
  const s = getSocket();
  s.auth = { token };
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  getSocket().disconnect();
}

export function useSocketEvent<T = unknown>(event: string, handler: (data: T) => void): void {
  useEffect(() => {
    const s = getSocket();
    s.on(event, handler);
    return () => {
      s.off(event, handler);
    };
  }, [event, handler]);
}
